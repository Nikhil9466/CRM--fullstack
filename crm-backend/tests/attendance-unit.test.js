const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  DEFAULT_POLICY,
  policyInput,
  localParts,
  summarize,
  correctionInput,
} = require("../src/utils/attendance");
const p = { ...DEFAULT_POLICY };
test("attendance duration excludes multiple breaks and derives lifecycle and late status", () => {
  const row = {
    checkIn: new Date("2026-09-23T09:30:00Z"),
    checkOut: new Date("2026-09-23T18:00:00Z"),
    policy: p,
    breaks: [{ start: "2026-09-23T13:00:00Z", end: "2026-09-23T13:30:00Z" }],
  };
  const r = summarize(row, "2026-09-23", p);
  assert.equal(r.workedSeconds, 8 * 3600);
  assert.equal(r.breakSeconds, 1800);
  assert.equal(r.status, "Checked Out");
  assert.equal(r.attendanceStatus, "Present");
  for (const [time, status] of [
    ["09:40:00", "Present"],
    ["09:45:00", "Present"],
    ["09:45:01", "Late"],
    ["09:50:00", "Late"],
  ]) {
    row.checkIn = new Date("2026-09-23T" + time + "Z");
    assert.equal(summarize(row, "2026-09-23", p).attendanceStatus, status);
  }
  row.checkOut = null;
  row.breaks = [{ start: "2026-09-23T13:00:00Z", end: null }];
  const b = summarize(row, "2026-09-23", p, new Date("2026-09-23T14:00:00Z"));
  assert.equal(b.status, "On Break");
  assert.equal(b.breakSeconds, 3600);
});
test("attendance timezone boundaries, absent timing, holidays and pre-employment", () => {
  assert.equal(
    localParts(new Date("2026-09-23T20:00:00Z"), "Asia/Kolkata").day,
    "2026-09-24",
  );
  assert.equal(
    summarize(null, "2026-09-23", p, new Date("2026-09-23T17:00:00Z")).status,
    "Not checked in",
  );
  assert.equal(
    summarize(null, "2026-09-23", p, new Date("2026-09-23T18:00:00Z")).status,
    "Absent",
  );
  assert.equal(summarize(null, "2026-09-20", p).status, "Holiday");
  assert.equal(
    summarize(
      null,
      "2026-09-23",
      p,
      new Date("2026-09-24"),
      new Date("2026-09-24"),
    ).status,
    "Not employed",
  );
});
test("attendance policy validation and invalid corrections", () => {
  assert.deepEqual(policyInput(p), p);
  for (const patch of [
    { timeZone: "No/Place" },
    { startTime: "23:00", endTime: "09:00" },
    { graceMinutes: -1 },
    { expectedMinutes: 1440 },
    { workingDays: [1, 1] },
    { workingDays: [] },
    { userId: "other" },
  ])
    assert.throws(() => policyInput({ ...p, ...patch }));
  const body = {
    checkIn: "2026-09-23T09:30:00Z",
    checkOut: "2026-09-23T18:00:00Z",
    breaks: [],
  };
  const now = new Date("2026-09-24T00:00:00Z");
  assert.equal(correctionInput(body, "2026-09-23", p, now).breaks.length, 0);
  for (const patch of [
    { checkOut: body.checkIn },
    { checkOut: "2026-09-25T00:00:00Z" },
    { checkIn: "2026-09-22T09:30:00Z" },
    { checkIn: "garbage" },
    {
      breaks: [{ start: "2026-09-23T13:00:00Z", end: "2026-09-23T19:00:00Z" }],
    },
    {
      breaks: [
        { start: "2026-09-23T13:00:00Z", end: "2026-09-23T14:00:00Z" },
        { start: "2026-09-23T13:30:00Z", end: "2026-09-23T14:30:00Z" },
      ],
    },
  ])
    assert.throws(() =>
      correctionInput({ ...body, ...patch }, "2026-09-23", p, now),
    );
});

test("open shift action expiry matches the server 24-hour boundary", () => {
  const record = {
    checkIn: new Date("2026-09-23T09:30:00Z"),
    checkOut: null,
    policy: p,
    breaks: [],
  };
  assert.equal(
    summarize(record, "2026-09-23", p, new Date("2026-09-24T09:30:00Z"))
      .actionsExpired,
    false,
  );
  assert.equal(
    summarize(record, "2026-09-23", p, new Date("2026-09-24T09:30:00.001Z"))
      .actionsExpired,
    true,
  );
  record.checkOut = new Date("2026-09-23T18:00:00Z");
  assert.equal(
    summarize(record, "2026-09-23", p, new Date("2026-09-24T10:00:00Z"))
      .actionsExpired,
    false,
  );
});

test("resuming preserves previous work, excludes the gap and restricts old or invalid shifts", () => {
  const { resumeEligible } = require("../src/utils/attendance");
  const now = new Date("2026-09-23T15:00:00Z");
  const row = {
    workDate: new Date("2026-09-23"),
    checkIn: new Date("2026-09-23T09:30:00Z"),
    checkOut: new Date("2026-09-23T14:00:00Z"),
    policy: p,
    breaks: [{ start: "2026-09-23T13:00:00Z", end: "2026-09-23T13:30:00Z" }],
  };
  assert.equal(resumeEligible(row, now), true);
  const before = summarize(row, "2026-09-23", p, now);
  const resumed = {
    ...row,
    checkOut: null,
    breaks: [...row.breaks, { start: row.checkOut, end: now }],
  };
  const after = summarize(resumed, "2026-09-23", p, now);
  assert.equal(before.workedSeconds, 4 * 3600);
  assert.equal(after.workedSeconds, before.workedSeconds);
  assert.equal(after.breakSeconds, 90 * 60);
  assert.equal(
    summarize(resumed, "2026-09-23", p, new Date(+now + 60000)).workedSeconds,
    4 * 3600 + 60,
  );
  assert.equal(resumeEligible(row, new Date("2026-09-24T00:00:00Z")), false);
  assert.equal(resumeEligible({ ...row, checkOut: null }, now), false);
  assert.equal(
    resumeEligible({ ...row, checkOut: new Date(+now + 1) }, now),
    false,
  );
  assert.equal(
    resumeEligible({ ...row, breaks: Array(20).fill(row.breaks[0]) }, now),
    false,
  );
  assert.equal(
    resumeEligible(
      { ...row, breaks: [{ start: row.checkIn, end: null }] },
      now,
    ),
    false,
  );
});
