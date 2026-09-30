const router = require("express").Router();
const { db, wrap } = require("../utils/changes");
const { admin, manager } = require("../middleware/auth");
const { recordScope } = require("../utils/access");
const { fail, choice, date, text } = require("../utils/input");
const kinds = { contacts: "contact", deals: "deal", tasks: "task" };
const pageOf = (req) =>
  Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
router.get(
  "/activity",
  admin,
  wrap(async (req, res) => {
    const page = pageOf(req),
      where = { orgId: req.user.orgId };
    if (req.query.type)
      where.entityType = choice(
        req.query.type,
        ["contact", "deal", "task", "user", "team", "teamRequest", "stage", "attendance"],
        "activity type",
      );
    if (req.query.from)
      where.createdAt = { gte: date(req.query.from, "From date") };
    if (req.query.to) {
      const end = date(req.query.to, "To date");
      end.setUTCDate(end.getUTCDate() + 1);
      where.createdAt = { ...where.createdAt, lt: end };
    }
    if (req.query.q) {
      const q = text(req.query.q, "Search", 120);
      where.OR = ["actorName", "entityLabel", "action"].map((key) => ({
        [key]: { contains: q, mode: "insensitive" },
      }));
      const labels = {
        attendance_resumed: "Resumed work",
        attendance_policy_updated: "Attendance policy updated",
        attendance_correction_requested: "Attendance correction requested",
        attendance_correction_approved: "Attendance correction approved",
        attendance_correction_rejected: "Attendance correction rejected",
        recycled: "Moved to recycle bin",
        restored: "Restored",
        password_changed: "Password changed",
        member_removed: "Removed from team",
        member_assigned: "Assigned to team",
        addition_requested: "Requested team addition",
        request_approved: "Approved team request",
        request_rejected: "Rejected team request",
      };
      const actions = Object.keys(labels).filter((key) =>
        labels[key].toLowerCase().includes(q.toLowerCase()),
      );
      if (actions.length) where.OR.push({ action: { in: actions } });
    }
    const [items, total] = await db.$transaction([
      db.activity.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 50,
        take: 50,
      }),
      db.activity.count({ where }),
    ]);
    res.json({ items, total, page, pageSize: 50 });
  }),
);
router.get(
  "/recycle-bin",
  manager,
  wrap(async (req, res) => {
    const type = choice(
        req.query.type || "contacts",
        Object.keys(kinds),
        "record type",
      ),
      model = kinds[type],
      page = pageOf(req);
    const where = {
      ...recordScope(req.user, model, true),
      deletedAt: { not: null },
    };
    if (req.query.q)
      where[model === "contact" ? "name" : "title"] = {
        contains: text(req.query.q, "Search", 120),
        mode: "insensitive",
      };
    const [rows, total] = await db.$transaction([
      db[model].findMany({
        where,
        orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 50,
        take: 50,
      }),
      db[model].count({ where }),
    ]);
    const people = await db.user.findMany({
      where: {
        orgId: req.user.orgId,
        id: { in: rows.map((r) => r.deletedBy).filter(Boolean) },
      },
      select: { id: true, name: true },
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        label: r.name || r.title,
        deletedAt: r.deletedAt,
        deletedByName:
          people.find((p) => p.id === r.deletedBy)?.name ||
          "Unavailable account",
      })),
      total,
      page,
      pageSize: 50,
      type,
    });
  }),
);
router.post(
  "/recycle-bin/:type/:id/restore",
  manager,
  wrap(async (req, res) => {
    const model =
      kinds[choice(req.params.type, Object.keys(kinds), "record type")];
    const row = await db[model].findFirst({
      where: {
        ...recordScope(req.user, model, true),
        id: req.params.id,
        deletedAt: { not: null },
      },
    });
    if (!row) fail("Deleted record not found in your permitted view.", 404);
    const parents = [];
    if (row.contactId) parents.push(["contact", row.contactId]);
    if (row.dealId) parents.push(["deal", row.dealId]);
    for (const [kind, id] of parents) {
      if (
        !(await db[kind].findFirst({
          where: { ...recordScope(req.user, kind), id },
        }))
      )
        fail(
          "Restore the linked contact or deal first. Ask an admin if it is outside your team.",
          409,
        );
    }
    if (model === "task" && row.assigneeId && req.user.role !== "ADMIN") {
      const assignee = await db.user.findFirst({
        where: { id: row.assigneeId, orgId: req.user.orgId },
      });
      for (const [kind, id] of parents)
        if (
          !assignee ||
          !(await db[kind].findFirst({
            where: { ...recordScope(assignee, kind), id },
          }))
        )
          fail(
            "The task assignee no longer has access to its linked record. Ask an admin to restore it and review its assignment.",
            409,
          );
    }
    res.json(
      await db[model].update({
        where: { id: row.id },
        data: { deletedAt: null, deletedBy: null },
      }),
    );
  }),
);
module.exports = router;
