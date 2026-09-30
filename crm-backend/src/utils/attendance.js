const { fail, date } = require("./input");
const DEFAULT_POLICY = Object.freeze({
  timeZone: "UTC",
  workingDays: [1, 2, 3, 4, 5],
  startTime: "09:30",
  endTime: "18:00",
  graceMinutes: 15,
  expectedMinutes: 480,
});
const DAY = 86400000;
function only(body, keys) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !keys.includes(k))
  )
    fail("Unexpected attendance fields.");
}
function clockMinutes(s) {
  if (typeof s !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
    fail("Time must be HH:MM (24-hour).");
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
}
function policyInput(body) {
  only(body, Object.keys(DEFAULT_POLICY));
  const p = { ...body };
  if (typeof p.timeZone !== "string" || p.timeZone.length > 80)
    fail("Choose a valid IANA timezone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: p.timeZone }).format();
  } catch {
    fail("Choose a valid IANA timezone.");
  }
  if (
    !Array.isArray(p.workingDays) ||
    !p.workingDays.length ||
    p.workingDays.length > 7 ||
    p.workingDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    new Set(p.workingDays).size !== p.workingDays.length
  )
    fail("Select one or more distinct working days.");
  const start = clockMinutes(p.startTime),
    end = clockMinutes(p.endTime);
  if (end <= start)
    fail(
      "Work end must be after work start. Overnight schedules are not supported.",
    );
  if (
    !Number.isInteger(p.graceMinutes) ||
    p.graceMinutes < 0 ||
    p.graceMinutes > 180
  )
    fail("Grace period must be 0–180 minutes.");
  if (
    !Number.isInteger(p.expectedMinutes) ||
    p.expectedMinutes < 1 ||
    p.expectedMinutes > end - start
  )
    fail("Expected working minutes must fit within scheduled hours.");
  p.workingDays.sort((a, b) => a - b);
  return p;
}
function localParts(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes:
      Number(parts.hour) * 60 +
      Number(parts.minute) +
      Number(parts.second) / 60,
  };
}
function dayDate(s) {
  const d = date(s, "Work date");
  if (!d) fail("Work date is required.");
  return d;
}
const workingDay = (day, p) => p.workingDays.includes(dayDate(day).getUTCDay());
// Resume only the current workday; older records must use correction review.
function resumeEligible(record, now = new Date()) {
  if (!record?.checkOut) return false;
  const day =
    typeof record.workDate === "string"
      ? record.workDate.slice(0, 10)
      : record.workDate.toISOString().slice(0, 10);
  return (
    localParts(now, record.policy.timeZone).day === day &&
    now >= new Date(record.checkOut) &&
    now - new Date(record.checkIn) < DAY &&
    record.breaks.length < 20 &&
    record.breaks.every((b) => b.end)
  );
}
function summarize(record, day, policy, now = new Date(), createdAt = null) {
  const local = localParts(now, policy.timeZone);
  if (!record) {
    let status = !workingDay(day, policy)
      ? "Holiday"
      : day < local.day ||
          (day === local.day && local.minutes >= clockMinutes(policy.endTime))
        ? "Absent"
        : "Not checked in";
    if (day > local.day) status = "Scheduled";
    if (createdAt && day < localParts(new Date(createdAt), policy.timeZone).day)
      status = "Not employed";
    return {
      workDate: day,
      checkIn: null,
      checkOut: null,
      breakSeconds: 0,
      workedSeconds: 0,
      status,
      attendanceStatus: status,
      breaks: [],
      policy,
      needsCorrection: false,
    };
  }
  const p = record.policy,
    end = record.checkOut ? new Date(record.checkOut) : now,
    begin = new Date(record.checkIn);
  const elapsed = Math.max(0, end - begin);
  const breakMs = record.breaks.reduce(
    (n, b) =>
      n +
      Math.max(
        0,
        Math.min(end, new Date(b.end || end)) -
          Math.max(begin, new Date(b.start)),
      ),
    0,
  );
  const checkLocal = localParts(begin, p.timeZone);
  const attendanceStatus = !workingDay(day, p)
    ? "Holiday"
    : checkLocal.minutes > clockMinutes(p.startTime) + p.graceMinutes
      ? "Late"
      : "Present";
  const status = record.checkOut
    ? "Checked Out"
    : record.breaks.some((b) => !b.end)
      ? "On Break"
      : "Working";
  return {
    ...record,
    workDate: day,
    policy: p,
    status,
    attendanceStatus,
    breakSeconds: Math.floor(breakMs / 1000),
    workedSeconds: Math.floor(Math.max(0, elapsed - breakMs) / 1000),
    expectedSeconds: p.expectedMinutes * 60,
    needsCorrection: !record.checkOut && localParts(now, p.timeZone).day > day,
    actionsExpired: !record.checkOut && now - begin > DAY,
    canResume: resumeEligible({ ...record, workDate: day }, now),
  };
}
function instant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
  )
    fail(label + " must be a UTC timestamp.");
  const d = new Date(value);
  if (
    !Number.isFinite(+d) ||
    d.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    fail("Invalid " + label + ".");
  return d;
}
function correctionInput(body, day, policy, now = new Date()) {
  only(body, ["checkIn", "checkOut", "breaks"]);
  const start = instant(body.checkIn, "Check-in"),
    end = instant(body.checkOut, "Checkout");
  if (localParts(start, policy.timeZone).day !== day)
    fail(
      "Check-in must fall on the requested workday in the workspace timezone.",
    );
  if (end <= start || end > now || end - start > DAY)
    fail(
      "Checkout must follow check-in, be in the past, and be within 24 hours.",
    );
  if (!Array.isArray(body.breaks) || body.breaks.length > 20)
    fail("Supply up to 20 complete breaks.");
  let previous = start;
  const breaks = body.breaks.map((b) => {
    only(b, ["start", "end"]);
    const s = instant(b.start, "Break start"),
      e = instant(b.end, "Break end");
    if (s < previous || e <= s || e > end)
      fail(
        "Breaks must be ordered, non-overlapping, and inside the work period.",
      );
    previous = e;
    return { start: s.toISOString(), end: e.toISOString() };
  });
  return { checkIn: start.toISOString(), checkOut: end.toISOString(), breaks };
}
module.exports = {
  DEFAULT_POLICY,
  DAY,
  only,
  policyInput,
  localParts,
  dayDate,
  workingDay,
  summarize,
  resumeEligible,
  correctionInput,
};
