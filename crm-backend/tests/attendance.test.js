const test = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const { headers, attachSession } = require("./helpers/client");
const enabled = process.env.CRM_TEST_DATABASE_URL;
if (enabled) process.env.DATABASE_URL = enabled;
test(
  "attendance API integration on a dedicated database",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = require("../src/app"),
      db = require("../src/config/prisma"),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api",
      suffix = randomUUID().slice(0, 8),
      orgId = "attendance-" + suffix,
      otherOrg = "attendance-other-" + suffix;
    let counter = 0;
    const body = (name) => ({
      name,
      email: `${name}-${suffix}@example.test`,
      phone: String(9000000000 + Math.floor(Math.random() * 900000000)),
      password: "AttendanceTest!123",
    });
    async function request(path, session, method = "GET", body) {
      const r = await fetch(base + path, {
        method,
        headers: headers(session),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = r.status === 204 ? null : await r.json();
      return { status: r.status, data: attachSession(data, r) };
    }
    async function api(path, session, method = "GET", body, status = 200) {
      const r = await request(path, session, method, body);
      assert.equal(
        r.status,
        status,
        `${method} ${path}: ${JSON.stringify(r.data)}`,
      );
      return r.data;
    }
    let a, other, e, lead, e2, lead2, team, team2;
    const now = new Date(),
      today = now.toISOString().slice(0, 10),
      yesterday = new Date(+now - 86400000).toISOString().slice(0, 10),
      twoDays = new Date(+now - 2 * 86400000).toISOString().slice(0, 10);
    const proposed = (day) => ({
      checkIn: day + "T09:30:00.000Z",
      checkOut: day + "T18:00:00.000Z",
      breaks: [{ start: day + "T13:00:00.000Z", end: day + "T13:30:00.000Z" }],
    });
    try {
      a = await api(
        "/auth/signup",
        null,
        "POST",
        { ...body("Admin"), orgId },
        201,
      );
      other = await api(
        "/auth/signup",
        null,
        "POST",
        { ...body("OtherAdmin"), orgId: otherOrg },
        201,
      );
      async function member(name) {
        const b = body(name),
          u = await api("/members", a.session, "POST", b, 201),
          login = await api("/auth/login", null, "POST", {
            email: b.email,
            password: b.password,
          });
        return { ...u, session: login.session };
      }
      e = await member("Employee");
      lead = await member("Leader");
      e2 = await member("OtherEmployee");
      lead2 = await member("OtherLeader");
      team = await api(
        "/teams",
        a.session,
        "POST",
        { name: "Sales", leaderId: lead.id },
        201,
      );
      team2 = await api(
        "/teams",
        a.session,
        "POST",
        { name: "Support", leaderId: lead2.id },
        201,
      );
      await api(`/teams/${team.id}/members`, a.session, "POST", {
        employeeId: e.id,
      });
      await api(`/teams/${team2.id}/members`, a.session, "POST", {
        employeeId: e2.id,
      });
      await db.user.updateMany({
        where: { orgId },
        data: { createdAt: new Date(+now - 10 * 86400000) },
      });
      const policy = {
        timeZone: "UTC",
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:30",
        endTime: "18:00",
        graceMinutes: 15,
        expectedMinutes: 480,
      };
      await t.test(
        "admin settings are isolated, validated and audited",
        async () => {
          await api("/attendance/settings", e.session, "PUT", policy, 403);
          await api(
            "/attendance/settings",
            a.session,
            "PUT",
            { ...policy, expectedMinutes: -1 },
            400,
          );
          assert.equal(
            (await api("/attendance/settings", a.session, "PUT", policy))
              .expectedMinutes,
            480,
          );
          assert.deepEqual(
            (await api("/attendance/settings", other.session)).workingDays,
            [1, 2, 3, 4, 5],
          );
          assert.ok(
            (await api("/activity?type=attendance", a.session)).items.some(
              (x) => x.action === "attendance_policy_updated",
            ),
          );
        },
      );
      await t.test(
        "state validation, identity spoofing and concurrent check-in",
        async () => {
          await api("/attendance/check-out", e.session, "POST", {}, 409);
          await api("/attendance/end-break", e.session, "POST", {}, 409);
          await api(
            "/attendance/check-in",
            e.session,
            "POST",
            { userId: e2.id },
            400,
          );
          const results = await Promise.all([
            request("/attendance/check-in", e.session, "POST", {}),
            request("/attendance/check-in", e.session, "POST", {}),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          await api("/attendance/check-in", e.session, "POST", {}, 409);
          assert.equal(
            (await api("/attendance/today", e.session)).today.status,
            "Working",
          );
        },
      );
      await t.test(
        "concurrent breaks, checkout and server-calculated history",
        async () => {
          const started = await Promise.all([
            request("/attendance/start-break", e.session, "POST", {}),
            request("/attendance/start-break", e.session, "POST", {}),
          ]);
          assert.deepEqual(started.map((r) => r.status).sort(), [200, 409]);
          assert.equal(
            (await api("/attendance/today", e.session)).today.status,
            "On Break",
          );
          await api("/attendance/check-out", e.session, "POST", {}, 409);
          const ended = await Promise.all([
            request("/attendance/end-break", e.session, "POST", {}),
            request("/attendance/end-break", e.session, "POST", {}),
          ]);
          assert.deepEqual(ended.map((r) => r.status).sort(), [200, 409]);
          const checked = await Promise.all([
            request("/attendance/check-out", e.session, "POST", {}),
            request("/attendance/check-out", e.session, "POST", {}),
          ]);
          assert.deepEqual(checked.map((r) => r.status).sort(), [200, 409]);
          const r = (
            await api(
              "/attendance/history?from=" + today + "&to=" + today,
              e.session,
            )
          ).items[0];
          assert.equal(r.status, "Checked Out");
          assert.equal(r.breaks.length, 1);
          assert.ok(r.workedSeconds >= 0);
        },
      );
      await t.test(
        "admin resumes own and employee timers safely with audit and concurrency protection",
        async () => {
          const before = (await api("/attendance/today", e.session)).today;
          const path = "/attendance/records/" + before.id + "/resume";
          const input = {
            version: before.version,
            reason: "Accidental checkout",
          };
          await api(path, e.session, "POST", input, 403);
          await api(path, lead.session, "POST", input, 403);
          await api(path, other.session, "POST", input, 404);
          await api(path, a.session, "POST", { ...input, reason: "" }, 400);
          await api(path, a.session, "POST", { ...input, userId: e2.id }, 400);
          const results = await Promise.all([
            request(path, a.session, "POST", input),
            request(path, a.session, "POST", input),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          const resumed = results.find((r) => r.status === 200).data;
          assert.equal(resumed.status, "Working");
          assert.equal(resumed.checkIn, before.checkIn);
          assert.equal(resumed.checkOut, null);
          assert.equal(resumed.workedSeconds, before.workedSeconds);
          assert.equal(resumed.attendanceStatus, before.attendanceStatus);
          assert.equal(resumed.breaks.length, before.breaks.length + 1);
          assert.equal(resumed.breaks.at(-1).start, before.checkOut);
          await api(
            path,
            a.session,
            "POST",
            { ...input, version: resumed.version },
            409,
          );
          await api("/attendance/check-out", e.session, "POST", {});
          await api(path, a.session, "POST", input, 409);
          await api("/attendance/check-in", a.session, "POST", {});
          const own = await api("/attendance/check-out", a.session, "POST", {});
          assert.equal(
            (
              await api(
                "/attendance/records/" + own.id + "/resume",
                a.session,
                "POST",
                { version: own.version, reason: "Tapped checkout by mistake" },
              )
            ).status,
            "Working",
          );
          await api("/attendance/check-out", a.session, "POST", {});
          const old = await db.attendanceRecord.create({
            data: {
              orgId,
              userId: e2.id,
              workDate: new Date(yesterday),
              checkIn: new Date(yesterday + "T09:30:00Z"),
              checkOut: new Date(yesterday + "T18:00:00Z"),
              policy,
            },
          });
          await api(
            "/attendance/records/" + old.id + "/resume",
            a.session,
            "POST",
            { version: old.version, reason: "Old day" },
            409,
          );
          await db.attendanceRecord.delete({ where: { id: old.id } });
          await db.user.update({
            where: { id: e.id },
            data: { active: false },
          });
          const current = await db.attendanceRecord.findUnique({
            where: { id: before.id },
          });
          await api(
            path,
            a.session,
            "POST",
            { version: current.version, reason: "Inactive account" },
            409,
          );
          await db.user.update({ where: { id: e.id }, data: { active: true } });
          const audit = await db.activity.findMany({
            where: { orgId, action: "attendance_resumed" },
          });
          assert.equal(audit.length, 2);
        },
      );
      await t.test(
        "employee, team and organisation scope; team reassignment",
        async () => {
          await api("/attendance/report", e.session, "GET", undefined, 403);
          await api(
            "/attendance/history?employeeId=" + e2.id,
            e.session,
            "GET",
            undefined,
            400,
          );
          let report = await api("/attendance/report", lead.session);
          assert.ok(report.items.some((r) => r.employee.id === e.id));
          assert.ok(!report.items.some((r) => r.employee.id === e2.id));
          assert.equal(
            (await api("/attendance/report?teamId=" + team2.id, lead.session))
              .total,
            0,
          );
          assert.equal(
            (await api("/attendance/report?employeeId=" + e2.id, lead.session))
              .total,
            0,
          );
          assert.equal(
            (await api("/attendance/report?employeeId=" + e.id, other.session))
              .total,
            0,
          );
          assert.ok((await api("/attendance/report", a.session)).total >= 5);
          await api(`/teams/${team2.id}/members`, a.session, "POST", {
            employeeId: e.id,
          });
          assert.ok(
            !(await api("/attendance/report", lead.session)).items.some(
              (r) => r.employee.id === e.id,
            ),
          );
          assert.ok(
            (await api("/attendance/report", lead2.session)).items.some(
              (r) => r.employee.id === e.id,
            ),
          );
          assert.equal(
            (
              await api(
                "/attendance/history?from=" + today + "&to=" + today,
                e.session,
              )
            ).items[0].status,
            "Checked Out",
          );
          await api(`/teams/${team.id}/members`, a.session, "POST", {
            employeeId: e.id,
          });
        },
      );
      let correction;
      await t.test(
        "correction validation, pending uniqueness and no silent official edits",
        async () => {
          await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: yesterday,
              reason: "Forgot checkout",
              proposed: {
                ...proposed(yesterday),
                checkOut: yesterday + "T08:00:00.000Z",
              },
            },
            400,
          );
          correction = await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: yesterday,
              reason: "Forgot the workday",
              proposed: proposed(yesterday),
            },
            201,
          );
          await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: yesterday,
              reason: "Duplicate",
              proposed: proposed(yesterday),
            },
            409,
          );
          assert.equal(
            (
              await api(
                "/attendance/history?from=" + yesterday + "&to=" + yesterday,
                e.session,
              )
            ).items[0].status,
            "Absent",
          );
          await api(
            "/attendance/corrections?view=review",
            lead.session,
            "GET",
            undefined,
            403,
          );
          await api(
            "/attendance/corrections/" + correction.id,
            e.session,
            "PATCH",
            { status: "APPROVED" },
            403,
          );
          await api(
            "/attendance/corrections/" + correction.id,
            other.session,
            "PATCH",
            { status: "APPROVED" },
            404,
          );
        },
      );
      await t.test(
        "approval recalculates hours, lateness and logs atomic audit",
        async () => {
          await api(
            "/attendance/corrections/" + correction.id,
            a.session,
            "PATCH",
            { status: "APPROVED", reviewNote: "Verified" },
          );
          const r = (
            await api(
              "/attendance/history?from=" + yesterday + "&to=" + yesterday,
              e.session,
            )
          ).items[0];
          assert.equal(r.workedSeconds, 28800);
          assert.equal(r.breakSeconds, 1800);
          assert.equal(r.attendanceStatus, "Present");
          await api(
            "/attendance/corrections/" + correction.id,
            a.session,
            "PATCH",
            { status: "APPROVED" },
            409,
          );
          assert.ok(
            (await api("/activity?type=attendance", a.session)).items.some(
              (x) => x.action === "attendance_correction_approved",
            ),
          );
          await api("/attendance/settings", a.session, "PUT", {
            ...policy,
            startTime: "08:00",
          });
          assert.equal(
            (
              await api(
                "/attendance/history?from=" + yesterday + "&to=" + yesterday,
                e.session,
              )
            ).items[0].attendanceStatus,
            "Present",
          );
          const late = await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: yesterday,
              reason: "Arrival was later",
              proposed: {
                ...proposed(yesterday),
                checkIn: yesterday + "T09:50:00.000Z",
              },
            },
            201,
          );
          await api("/attendance/corrections/" + late.id, a.session, "PATCH", {
            status: "APPROVED",
          });
          assert.equal(
            (
              await api(
                "/attendance/history?from=" + yesterday + "&to=" + yesterday,
                e.session,
              )
            ).items[0].attendanceStatus,
            "Late",
          );
        },
      );
      await t.test(
        "rejection, admin self-approval and stale corrections blocked",
        async () => {
          const r = await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: twoDays,
              reason: "Missed shift",
              proposed: proposed(twoDays),
            },
            201,
          );
          await api("/attendance/corrections/" + r.id, a.session, "PATCH", {
            status: "REJECTED",
            reviewNote: "Not authorised",
          });
          assert.equal(
            (
              await api(
                "/attendance/history?from=" + twoDays + "&to=" + twoDays,
                e.session,
              )
            ).items[0].checkIn,
            null,
          );
          const own = await api(
            "/attendance/corrections",
            a.session,
            "POST",
            {
              workDate: twoDays,
              reason: "Admin shift",
              proposed: proposed(twoDays),
            },
            201,
          );
          await api(
            "/attendance/corrections/" + own.id,
            a.session,
            "PATCH",
            { status: "APPROVED" },
            200,
          );
          const approved = await db.attendanceCorrectionRequest.findUnique({
            where: { id: own.id },
          });
          assert.equal(approved.status, "APPROVED");
          assert.equal(approved.reviewedBy, approved.userId);
          const stale = await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: yesterday,
              reason: "Stale request",
              proposed: proposed(yesterday),
            },
            201,
          );
          await db.attendanceRecord.updateMany({
            where: { orgId, userId: e.id, workDate: new Date(yesterday) },
            data: { version: { increment: 1 } },
          });
          await api(
            "/attendance/corrections/" + stale.id,
            a.session,
            "PATCH",
            { status: "APPROVED" },
            409,
          );
          await api("/attendance/corrections/" + stale.id, a.session, "PATCH", {
            status: "REJECTED",
          });
        },
      );
      await t.test(
        "off days, expired open shifts, deactivated sessions and CSRF",
        async () => {
          await api("/attendance/settings", a.session, "PUT", {
            ...policy,
            workingDays: [(new Date().getUTCDay() + 1) % 7],
          });
          await api("/attendance/check-in", e2.session, "POST", {}, 409);
          await api("/attendance/settings", a.session, "PUT", policy);
          await db.attendanceRecord.create({
            data: {
              orgId,
              userId: e2.id,
              workDate: new Date(twoDays),
              checkIn: new Date(twoDays + "T09:30:00Z"),
              policy,
            },
          });
          await api("/attendance/check-in", e2.session, "POST", {}, 409);
          await api("/attendance/check-out", e2.session, "POST", {}, 409);
          assert.equal(
            (await api("/attendance/today", e2.session)).open.needsCorrection,
            true,
          );
          await api("/members/" + e2.id, a.session, "PATCH", { active: false });
          await api("/attendance/today", e2.session, "GET", undefined, 401);
          await api("/attendance/check-in", e2.session, "POST", {}, 401);
          await api(
            "/attendance/check-in",
            { cookie: e.session.cookie, csrfToken: "invalid" },
            "POST",
            {},
            403,
          );
        },
      );
      await t.test(
        "pending missing-day corrections retain trusted policy across settings changes",
        async () => {
          await api("/attendance/settings", a.session, "PUT", policy);
          const day = new Date(+now - 3 * 86400000).toISOString().slice(0, 10);
          await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: day,
              reason: "Cannot supply a policy",
              proposed: {
                ...proposed(day),
                policy: { ...policy, startTime: "12:00" },
              },
            },
            400,
          );
          const pending = await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: day,
              reason: "Missing day before policy update",
              proposed: proposed(day),
            },
            201,
          );
          assert.deepEqual(pending.proposed.policy, policy);
          await api("/attendance/settings", a.session, "PUT", {
            ...policy,
            timeZone: "Pacific/Honolulu",
            startTime: "08:00",
          });
          const results = await Promise.all([
            request(
              "/attendance/corrections/" + pending.id,
              a.session,
              "PATCH",
              { status: "APPROVED" },
            ),
            request(
              "/attendance/corrections/" + pending.id,
              a.session,
              "PATCH",
              { status: "APPROVED" },
            ),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          const saved = (
            await api(
              "/attendance/history?from=" + day + "&to=" + day,
              e.session,
            )
          ).items[0];
          assert.equal(saved.policy.timeZone, "UTC");
          assert.equal(saved.attendanceStatus, "Present");
          assert.equal(saved.workedSeconds, 28800);
          assert.equal(
            await db.activity.count({
              where: {
                orgId,
                entityId: pending.id,
                action: "attendance_correction_approved",
              },
            }),
            1,
          );
          await api("/attendance/settings", a.session, "PUT", policy);
        },
      );
      await t.test(
        "legacy pending corrections without a policy snapshot remain reviewable",
        async () => {
          const day = new Date(+now - 4 * 86400000).toISOString().slice(0, 10);
          const pending = await api(
            "/attendance/corrections",
            e.session,
            "POST",
            {
              workDate: day,
              reason: "Legacy request",
              proposed: proposed(day),
            },
            201,
          );
          await db.attendanceCorrectionRequest.update({
            where: { id: pending.id },
            data: { proposed: proposed(day) },
          });
          await api(
            "/attendance/corrections/" + pending.id,
            a.session,
            "PATCH",
            { status: "APPROVED" },
          );
          assert.equal(
            (
              await api(
                "/attendance/history?from=" + day + "&to=" + day,
                e.session,
              )
            ).items[0].workedSeconds,
            28800,
          );
        },
      );
    } finally {
      const where = { orgId: { in: [orgId, otherOrg] } };
      await db.attendanceCorrectionRequest.deleteMany({ where });
      await db.attendanceBreak.deleteMany({ where });
      await db.attendanceRecord.deleteMany({ where });
      await db.attendanceSettings.deleteMany({ where });
      await db.activity.deleteMany({ where });
      await db.teamRequest.deleteMany({ where });
      await db.user.deleteMany({ where });
      await db.team.deleteMany({ where });
      await db.stage.deleteMany({ where });
      await db.organisation.deleteMany({
        where: { id: { in: [orgId, otherOrg] } },
      });
      await new Promise((r) => server.close(r));
      await db.$disconnect();
    }
  },
);
