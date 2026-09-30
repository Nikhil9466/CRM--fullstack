const router = require("express").Router();
const { db, wrap } = require("../utils/changes");
const { admin, manager } = require("../middleware/auth");
const { memberScope } = require("../utils/access");
const { fail, text, choice } = require("../utils/input");
const {
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
} = require("../utils/attendance");
const include = { breaks: { orderBy: { start: "asc" } } };
const org = (req) => ({ orgId: req.user.orgId });
async function policy(req) {
  const row = await db.attendanceSettings.findUnique({ where: org(req) });
  return row
    ? Object.fromEntries(Object.keys(DEFAULT_POLICY).map((k) => [k, row[k]]))
    : { ...DEFAULT_POLICY };
}
function audit(req, action, label, details = {}, id = null) {
  req.attendanceAudit = {
    action,
    entityType: "attendance",
    entityLabel: label,
    entityId: id,
    details,
  };
}
const recordFor = (req, day, userId = req.user.id) =>
  db.attendanceRecord.findUnique({
    where: {
      orgId_userId_workDate: { ...org(req), userId, workDate: dayDate(day) },
    },
    include,
  });
function pageOf(req) {
  return Math.max(
    1,
    Math.min(100000, Number.parseInt(req.query.page, 10) || 1),
  );
}
router.get(
  "/attendance/settings",
  wrap(async (req, res) => res.json(await policy(req))),
);
router.put(
  "/attendance/settings",
  admin,
  wrap(async (req, res) => {
    const data = policyInput(req.body),
      previous = await policy(req);
    await db.attendanceSettings.upsert({
      where: org(req),
      create: { ...org(req), ...data },
      update: data,
    });
    audit(req, "attendance_policy_updated", "Attendance policy", {
      ...data,
      workingDays: data.workingDays.join(", "),
      previous: { ...previous, workingDays: previous.workingDays.join(", ") },
    });
    res.json(data);
  }),
);
router.get(
  "/attendance/today",
  wrap(async (req, res) => {
    const p = await policy(req),
      now = new Date(),
      day = localParts(now, p.timeZone).day;
    const [record, open] = await Promise.all([
      recordFor(req, day),
      db.attendanceRecord.findFirst({
        where: { ...org(req), userId: req.user.id, checkOut: null },
        include,
        orderBy: { workDate: "asc" },
      }),
    ]);
    res.json({
      today: summarize(record, day, p, now),
      open: open
        ? summarize(
            open,
            open.workDate.toISOString().slice(0, 10),
            open.policy,
            now,
          )
        : null,
      policy: p,
      serverNow: now.toISOString(),
    });
  }),
);
for (const action of ["check-in", "start-break", "end-break", "check-out"])
  router.post(
    "/attendance/" + action,
    wrap(async (req, res) => {
      only(req.body, []);
      const p = await policy(req),
        now = new Date(),
        day = localParts(now, p.timeZone).day;
      let record = await db.attendanceRecord.findFirst({
        where: { ...org(req), userId: req.user.id, checkOut: null },
        include,
      });
      if (action === "check-in") {
        if (record)
          fail(
            "An attendance record is still open. Finish it or request a correction before checking in again.",
            409,
          );
        if (await recordFor(req, day))
          fail("Already checked in for this workday.", 409);
        if (!workingDay(day, p))
          fail(
            "Today is a non-working day. Check-in is unavailable; request a correction for authorised off-day work.",
            409,
          );
        record = await db.attendanceRecord.create({
          data: {
            ...org(req),
            userId: req.user.id,
            workDate: dayDate(day),
            checkIn: now,
            policy: p,
          },
          include,
        });
      } else {
        if (!record) fail("No open attendance record. Check in first.", 409);
        if (now - record.checkIn > DAY)
          fail(
            "This workday is over 24 hours old. Submit a correction to close it.",
            409,
          );
        const active = record.breaks.find((b) => !b.end);
        if (action === "start-break") {
          if (active) fail("A break is already open.", 409);
          if (record.breaks.length >= 20)
            fail("Maximum 20 breaks per workday.");
          await db.attendanceBreak.create({
            data: { ...org(req), recordId: record.id, start: now },
          });
        } else if (action === "end-break") {
          if (!active) fail("There is no open break.", 409);
          await db.attendanceBreak.update({
            where: { id: active.id },
            data: { end: now },
          });
        } else if (active) fail("End your break before checking out.", 409);
        record = await db.attendanceRecord.update({
          where: { id: record.id },
          data: {
            ...(action === "check-out" ? { checkOut: now } : {}),
            version: { increment: 1 },
          },
          include,
        });
      }
      audit(
        req,
        "attendance_" + action.replaceAll("-", "_"),
        req.user.name + " · " + record.workDate.toISOString().slice(0, 10),
        { workDate: record.workDate.toISOString().slice(0, 10) },
        record.id,
      );
      res.json(
        summarize(
          record,
          record.workDate.toISOString().slice(0, 10),
          record.policy,
          now,
        ),
      );
    }),
  );
router.post(
  "/attendance/records/:id/resume",
  admin,
  wrap(async (req, res) => {
    only(req.body, ["version", "reason"]);
    if (!Number.isInteger(req.body.version) || req.body.version < 1)
      fail("Refresh attendance before resuming work.");
    const reason = text(req.body.reason, "Reason", 500);
    const record = await db.attendanceRecord.findFirst({
      where: { id: req.params.id, ...org(req) },
      include,
    });
    if (!record) fail("Attendance record not found.", 404);
    if (record.version !== req.body.version)
      fail("Attendance changed. Refresh and retry.", 409);
    const employee = await db.user.findFirst({
      where: { id: record.userId, ...org(req), active: true },
      select: { name: true },
    });
    if (!employee) fail("Cannot resume work for an inactive account.", 409);
    const now = new Date();
    if (!resumeEligible(record, now))
      fail(
        "Only a completed current workday within 24 hours of check-in can be resumed, with fewer than 20 breaks. Use a correction for older records.",
        409,
      );
    const conflict = await db.attendanceRecord.findFirst({
      where: {
        ...org(req),
        userId: record.userId,
        id: { not: record.id },
        OR: [
          { checkOut: null },
          { checkIn: { lt: now }, checkOut: { gt: record.checkOut } },
        ],
      },
    });
    if (conflict)
      fail("Another workday overlaps this period or is already open.", 409);
    // Preserve time already worked; the checked-out gap is non-working time.
    if (now > record.checkOut)
      await db.attendanceBreak.create({
        data: {
          ...org(req),
          recordId: record.id,
          start: record.checkOut,
          end: now,
        },
      });
    const updated = await db.attendanceRecord.update({
      where: { id: record.id },
      data: { checkOut: null, version: { increment: 1 } },
      include,
    });
    const day = record.workDate.toISOString().slice(0, 10);
    audit(
      req,
      "attendance_resumed",
      employee.name + " · " + day,
      {
        employeeId: record.userId,
        workDate: day,
        reason,
        checkOut: null,
        resumedAt: now.toISOString(),
        previous: { checkOut: record.checkOut.toISOString() },
      },
      record.id,
    );
    res.json(summarize(updated, day, updated.policy, now));
  }),
);
router.get(
  "/attendance/history",
  wrap(async (req, res) => {
    only(req.query, ["from", "to"]);
    const p = await policy(req),
      now = new Date(),
      today = localParts(now, p.timeZone).day;
    const to = dayDate(req.query.to || today),
      from = dayDate(
        req.query.from || new Date(+to - 29 * DAY).toISOString().slice(0, 10),
      );
    if (from > to || to - from > 92 * DAY || to > dayDate(today))
      fail("Choose a past date range of at most 93 days.");
    const [records, user] = await Promise.all([
      db.attendanceRecord.findMany({
        where: {
          ...org(req),
          userId: req.user.id,
          workDate: { gte: from, lte: to },
        },
        include,
      }),
      db.user.findUnique({
        where: { id: req.user.id },
        select: { createdAt: true },
      }),
    ]);
    const items = [];
    for (let d = +to; d >= +from; d -= DAY) {
      const day = new Date(d).toISOString().slice(0, 10);
      const record = records.find(
        (r) => r.workDate.toISOString().slice(0, 10) === day,
      );
      const row = summarize(record, day, p, now, user.createdAt);
      if (row.status !== "Not employed") items.push(row);
    }
    res.json({ items, policy: p, serverNow: now.toISOString() });
  }),
);
router.get(
  "/attendance/report",
  manager,
  wrap(async (req, res) => {
    only(req.query, ["date", "teamId", "employeeId", "status", "page"]);
    const p = await policy(req),
      now = new Date(),
      day = req.query.date || localParts(now, p.timeZone).day;
    dayDate(day);
    if (day > localParts(now, p.timeZone).day)
      fail("Choose today or a past date.");
    const filters = {};
    if (req.query.teamId) filters.teamId = text(req.query.teamId, "Team", 100);
    if (req.query.employeeId)
      filters.id = text(req.query.employeeId, "Employee", 100);
    const people = await db.user.findMany({
      where: { AND: [memberScope(req.user), filters] },
      select: {
        id: true,
        name: true,
        active: true,
        createdAt: true,
        team: { select: { name: true } },
        teamId: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const records = await db.attendanceRecord.findMany({
      where: {
        ...org(req),
        workDate: dayDate(day),
        userId: { in: people.map((m) => m.id) },
      },
      include,
    });
    let rows = people
      .filter((u) => u.active || records.some((r) => r.userId === u.id))
      .map((u) => ({
        employee: u,
        ...summarize(
          records.find((r) => r.userId === u.id),
          day,
          p,
          now,
          u.createdAt,
        ),
      }))
      .filter((r) => r.status !== "Not employed");
    const summary = Object.fromEntries(
      [
        "Present",
        "Late",
        "Absent",
        "Working",
        "On Break",
        "Checked Out",
        "Holiday",
        "Not checked in",
      ].map((s) => [
        s,
        rows.filter((r) => r.status === s || r.attendanceStatus === s).length,
      ]),
    );
    if (req.query.status) {
      const s = choice(req.query.status, Object.keys(summary), "status");
      rows = rows.filter((r) => r.status === s || r.attendanceStatus === s);
    }
    const page = pageOf(req),
      total = rows.length;
    res.json({
      items: rows.slice((page - 1) * 50, page * 50),
      total,
      page,
      pageSize: 50,
      summary,
      date: day,
      today: localParts(now, p.timeZone).day,
      policy: p,
      serverNow: now.toISOString(),
    });
  }),
);
router.get(
  "/attendance/corrections",
  wrap(async (req, res) => {
    only(req.query, ["view", "status", "page"]);
    const view = choice(
      req.query.view || "mine",
      ["mine", "review"],
      "correction view",
    );
    if (view === "review" && req.user.role !== "ADMIN")
      fail("Administrator permission required.", 403);
    const where = {
      ...org(req),
      ...(view === "mine" ? { userId: req.user.id } : {}),
    };
    if (req.query.status)
      where.status = choice(
        req.query.status,
        ["PENDING", "APPROVED", "REJECTED"],
        "request status",
      );
    const page = pageOf(req);
    const [items, total] = await Promise.all([
      db.attendanceCorrectionRequest.findMany({
        where,
        include: {
          user: { select: { name: true, active: true } },
          reviewer: { select: { name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 50,
        take: 50,
      }),
      db.attendanceCorrectionRequest.count({ where }),
    ]);
    res.json({ items, total, page, pageSize: 50 });
  }),
);
router.post(
  "/attendance/corrections",
  wrap(async (req, res) => {
    only(req.body, ["workDate", "proposed", "reason"]);
    const day = text(req.body.workDate, "Work date", 10),
      workDate = dayDate(day),
      p = await policy(req),
      now = new Date();
    if (day > localParts(now, p.timeZone).day)
      fail("Cannot correct a future workday.");
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (day < localParts(user.createdAt, p.timeZone).day)
      fail("Cannot correct attendance before the account was created.");
    const record = await recordFor(req, day),
      requestPolicy = record?.policy || p,
      proposed = correctionInput(req.body.proposed, day, requestPolicy, now);
    const reason = text(req.body.reason, "Reason", 1000);
    if (
      await db.attendanceCorrectionRequest.findFirst({
        where: {
          ...org(req),
          userId: req.user.id,
          workDate,
          status: "PENDING",
        },
      })
    )
      fail("A correction for this date is already pending.", 409);
    const request = await db.attendanceCorrectionRequest.create({
      data: {
        ...org(req),
        userId: req.user.id,
        workDate,
        proposed: { ...proposed, policy: requestPolicy },
        reason,
        baseVersion: record?.version ?? null,
      },
    });
    audit(
      req,
      "attendance_correction_requested",
      req.user.name + " · " + day,
      { workDate: day, reason },
      request.id,
    );
    res.status(201).json(request);
  }),
);
router.patch(
  "/attendance/corrections/:id",
  admin,
  wrap(async (req, res) => {
    only(req.body, ["status", "reviewNote"]);
    const status = choice(
        req.body.status,
        ["APPROVED", "REJECTED"],
        "decision",
      ),
      reviewNote = text(req.body.reviewNote, "Review note", 1000, true);
    const request = await db.attendanceCorrectionRequest.findFirst({
      where: { id: req.params.id, ...org(req) },
      include: { user: { select: { name: true } } },
    });
    if (!request) fail("Correction request not found.", 404);

    if (request.status !== "PENDING")
      fail("This request has already been reviewed.", 409);
    const day = request.workDate.toISOString().slice(0, 10);
    let previous = {};
    if (status === "APPROVED") {
      const record = await recordFor(req, day, request.userId),
        // Legacy requests have no policy snapshot; retain their previous fallback.
        p = record?.policy || request.proposed.policy || (await policy(req));
      if ((record?.version ?? null) !== request.baseVersion)
        fail(
          "Attendance changed since this request. Reject it and ask for a new correction.",
          409,
        );
      const { checkIn, checkOut, breaks } = request.proposed;
      const data = correctionInput({ checkIn, checkOut, breaks }, day, p);
      const overlap = await db.attendanceRecord.findFirst({
        where: {
          ...org(req),
          userId: request.userId,
          ...(record ? { id: { not: record.id } } : {}),
          checkIn: { lt: new Date(data.checkOut) },
          OR: [
            { checkOut: null },
            { checkOut: { gt: new Date(data.checkIn) } },
          ],
        },
      });
      if (overlap) fail("The corrected period overlaps another workday.", 409);
      previous = record
        ? {
            checkIn: record.checkIn.toISOString(),
            checkOut: record.checkOut?.toISOString() || null,
            breaks: JSON.stringify(
              record.breaks.map((b) => ({ start: b.start, end: b.end })),
            ),
          }
        : {};
      const saved = record
        ? await db.attendanceRecord.update({
            where: { id: record.id },
            data: {
              checkIn: new Date(data.checkIn),
              checkOut: new Date(data.checkOut),
              version: { increment: 1 },
            },
          })
        : await db.attendanceRecord.create({
            data: {
              ...org(req),
              userId: request.userId,
              workDate: request.workDate,
              checkIn: new Date(data.checkIn),
              checkOut: new Date(data.checkOut),
              policy: p,
            },
          });
      await db.attendanceBreak.deleteMany({
        where: { ...org(req), recordId: saved.id },
      });
      if (data.breaks.length)
        await db.attendanceBreak.createMany({
          data: data.breaks.map((b) => ({
            ...org(req),
            recordId: saved.id,
            start: new Date(b.start),
            end: new Date(b.end),
          })),
        });
    }
    const updated = await db.attendanceCorrectionRequest.update({
      where: { id: request.id },
      data: {
        status,
        reviewNote,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
    });
    audit(
      req,
      status === "APPROVED"
        ? "attendance_correction_approved"
        : "attendance_correction_rejected",
      request.user.name + " · " + day,
      {
        workDate: day,
        status,
        reason: request.reason,
        reviewNote,
        ...(status === "APPROVED"
          ? {
              checkIn: request.proposed.checkIn,
              checkOut: request.proposed.checkOut,
              breaks: JSON.stringify(request.proposed.breaks),
              previous,
            }
          : {}),
      },
      request.id,
    );
    res.json(updated);
  }),
);
module.exports = router;
