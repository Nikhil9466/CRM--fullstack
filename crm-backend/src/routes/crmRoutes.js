const router = require("express").Router();
const { db: prisma, wrap } = require("../utils/changes");
const bcrypt = require("bcrypt");
const { Prisma } = require("@prisma/client");
const {
  authenticate,
  admin,
  manager,
  publicSelect,
} = require("../middleware/auth");
const { fail, text, date, money, choice, account } = require("../utils/input");
const { recordScope, memberScope } = require("../utils/access");
const scope = (req, model) => recordScope(req.user, model);
const contains = (value) => ({ contains: value, mode: "insensitive" });
const query = (req) =>
  typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
const dealInclude = { contact: true, stage: true };
const taskInclude = { contact: true, deal: true };
async function own(model, id, user, db = prisma) {
  text(id, "Record ID", 100);
  const row = await db[model].findFirst({
    where: { id, ...recordScope(user, model) },
  });
  if (!row) fail("Record not found.", 404);
  return row;
}
router.use(authenticate);
router.use(require("./documentRoutes"));
router.use(require("./teamRoutes"));
router.use(require("./attendanceRoutes"));
router.use(require("./historyRoutes"));
router.get(
  "/me",
  wrap(async (req, res) =>
    res.json(
      await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          ...publicSelect,
          phone: true,
          createdAt: true,
          team: { select: { name: true } },
        },
      }),
    ),
  ),
);
router.post(
  "/password",
  wrap(async (req, res) => {
    const password = req.body.password;
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      Buffer.byteLength(password) > 72
    )
      fail("New password must be 12+ characters and at most 72 UTF-8 bytes.");
    if (typeof req.body.currentPassword !== "string")
      fail("Current password is required.");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash)))
      fail("Current password is incorrect.");
    const changed = await prisma.user.updateMany({
      where: {
        id: user.id,
        active: true,
        passwordHash: user.passwordHash,
        sessionVersion: user.sessionVersion,
      },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        sessionVersion: { increment: 1 },
      },
    });
    if (!changed.count)
      fail("Your account changed while saving. Sign in again and retry.", 409);
    res.json({
      message: "Password changed. Please log in again on all devices.",
    });
  }),
);
router.patch(
  "/member-passwords/:id",
  admin,
  wrap(async (req, res) => {
    if (req.params.id === req.user.id)
      fail("Change your own password from your profile.");
    const password = req.body.password;
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      Buffer.byteLength(password) > 72
    )
      fail("New password must be 12+ characters and at most 72 UTF-8 bytes.");
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Organisation" WHERE "id" = $1 FOR UPDATE',
        req.user.orgId,
      );
      const actor = await own("user", req.user.id, req.user, tx);
      if (!actor.active || actor.role !== "ADMIN")
        fail("Administrator permission required.", 403);
      const target = await own("user", req.params.id, req.user, tx);
      await tx.user.update({
        where: { id: target.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
    });
    res.json({
      message:
        "Password updated. Existing sessions were signed out; account activation and role are unchanged.",
    });
  }),
);
router.get(
  "/members",
  wrap(async (req, res) => {
    res.json(
      await prisma.user.findMany({
        where: memberScope(req.user),
        select: publicSelect,
        orderBy: { name: "asc" },
      }),
    );
  }),
);
router.post(
  "/members",
  admin,
  wrap(async (req, res) => {
    const { password, ...fields } = account(req.body);
    const role = choice(
      req.body.role || "EMPLOYEE",
      ["EMPLOYEE", "SUB_ADMIN", "ADMIN"],
      "role",
    );
    res.status(201).json(
      await prisma.user.create({
        data: {
          ...fields,
          ...scope(req),
          role,
          passwordHash: await bcrypt.hash(password, 12),
        },
        select: publicSelect,
      }),
    );
  }),
);
router.patch(
  "/members/:id",
  admin,
  wrap(async (req, res) => {
    if (req.params.id === req.user.id)
      fail("You cannot change your own role or deactivate yourself.");
    const data = {};
    if (req.body.role !== undefined)
      data.role = choice(
        req.body.role,
        ["EMPLOYEE", "SUB_ADMIN", "ADMIN"],
        "role",
      );
    if (req.body.active !== undefined) {
      if (typeof req.body.active !== "boolean")
        fail("Active must be true or false.");
      data.active = req.body.active;
      if (!data.active) data.sessionVersion = { increment: 1 };
    }
    const user = await prisma.$transaction(async (tx) => {
      // Lock the org while changing admins so two requests don’t clash.
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Organisation" WHERE "id" = $1 FOR UPDATE',
        req.user.orgId,
      );
      const actor = await own("user", req.user.id, req.user, tx);
      if (!actor.active || actor.role !== "ADMIN")
        fail("Administrator permission required.", 403);
      const target = await own("user", req.params.id, req.user, tx);
      if (
        target.role === "ADMIN" &&
        target.active &&
        ((data.role && data.role !== "ADMIN") || data.active === false)
      ) {
        if (
          (await tx.user.count({
            where: { ...scope(req), role: "ADMIN", active: true },
          })) <= 1
        )
          fail("Keep at least one active administrator.");
      }
      if (
        data.role === "SUB_ADMIN" &&
        target.role !== "SUB_ADMIN" &&
        target.teamId
      )
        fail(
          "Appoint this employee as leader from Teams & performance so the team's leadership is updated together.",
        );
      if ((data.role && data.role !== target.role) || data.active === false) {
        await tx.team.updateMany({
          where: { leaderId: target.id, orgId: req.user.orgId },
          data: { leaderId: null },
        });
        if (data.role === "ADMIN" || data.active === false) data.teamId = null;
      }
      return tx.user.update({
        where: { id: target.id },
        data,
        select: publicSelect,
      });
    });
    res.json(user);
  }),
);
router.get(
  "/stages",
  wrap(async (req, res) => {
    res.json(
      await prisma.stage.findMany({
        where: scope(req),
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
    );
  }),
);
router.post(
  "/stages",
  admin,
  wrap(async (req, res) => {
    const data = {
      ...scope(req),
      name: text(req.body.name, "Stage name", 60),
      kind: choice(
        req.body.kind || "OPEN",
        ["OPEN", "WON", "LOST"],
        "stage type",
      ),
      position: Number(req.body.position ?? 0),
    };
    if (
      !Number.isInteger(data.position) ||
      data.position < 0 ||
      data.position > 999
    )
      fail("Position must be 0–999.");
    res.status(201).json(await prisma.stage.create({ data }));
  }),
);
router.patch(
  "/stages/:id",
  admin,
  wrap(async (req, res) => {
    await own("stage", req.params.id, req.user);
    const data = {
      name: text(req.body.name, "Stage name", 60),
      position: Number(req.body.position ?? 0),
    };
    if (
      !Number.isInteger(data.position) ||
      data.position < 0 ||
      data.position > 999
    )
      fail("Position must be 0–999.");
    // Keep the stage type as-is or old wins could change.
    res.json(await prisma.stage.update({ where: { id: req.params.id }, data }));
  }),
);
router.delete(
  "/stages/:id",
  admin,
  wrap(async (req, res) => {
    await own("stage", req.params.id, req.user);
    if (
      await prisma.deal.count({
        where: { stageId: req.params.id, ...scope(req) },
      })
    )
      fail(
        "Move deals out of this stage before deleting it. Restore any recycled deals in this stage first.",
        409,
      );
    await prisma.stage.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
function listOptions(req, fields) {
  const sort = fields.includes(req.query.sort) ? req.query.sort : "createdAt";
  const direction = req.query.direction === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  return {
    orderBy: [{ [sort]: direction }, { id: "asc" }],
    skip: (page - 1) * 50,
    take: 50,
  };
}
async function list(res, model, where, options, include) {
  const [items, total] = await prisma.$transaction([
    prisma[model].findMany({ where, ...options, include }),
    prisma[model].count({ where }),
  ]);
  res.json({ items, total, page: options.skip / 50 + 1, pageSize: 50 });
}
router.get(
  "/contacts",
  wrap(async (req, res) => {
    const q = query(req);
    const where = {
      ...scope(req, "contact"),
      ...(q
        ? { OR: ["name", "email", "phone"].map((k) => ({ [k]: contains(q) })) }
        : {}),
    };
    if (req.query.company)
      where.company = contains(text(req.query.company, "Company", 120));
    if (req.query.assigneeId)
      where.AND = [
        ...(where.AND || []),
        { assigneeId: text(req.query.assigneeId, "Assignee", 100) },
      ];
    if (req.query.from)
      where.createdAt = { gte: date(req.query.from, "From date") };
    if (req.query.to) {
      const until = date(req.query.to, "To date");
      until.setUTCDate(until.getUTCDate() + 1);
      where.createdAt = { ...where.createdAt, lt: until };
    }
    await list(
      res,
      "contact",
      where,
      listOptions(req, ["name", "company", "createdAt"]),
    );
  }),
);
async function contactData(req, old) {
  const b = req.body;
  const data = {
    name: text(b.name, "Name", 120),
    email: text(b.email, "Email", 254, true),
    phone: text(b.phone, "Phone", 30, true),
    company: text(b.company, "Company", 120, true),
  };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    fail("Enter a valid contact email.");
  if (data.email) data.email = data.email.toLowerCase();
  const assigneeId =
    b.assigneeId === undefined
      ? (old?.assigneeId ?? req.user.id)
      : b.assigneeId || (req.user.role === "ADMIN" ? null : req.user.id);
  if (req.user.role === "EMPLOYEE" && assigneeId !== req.user.id)
    fail("Employees can only assign work to themselves.", 403);
  if (assigneeId) {
    const member = await prisma.user.findFirst({
      where: { id: assigneeId, ...memberScope(req.user) },
    });
    if (!member) fail("Team member not found.", 404);
    if (!member.active && old?.assigneeId !== assigneeId)
      fail("Choose an active team member.");
  }
  data.assigneeId = assigneeId;
  return data;
}
router.post(
  "/contacts",
  wrap(async (req, res) => {
    res.status(201).json(
      await prisma.contact.create({
        data: { ...scope(req), ...(await contactData(req)) },
      }),
    );
  }),
);
router.patch(
  "/contacts/:id",
  wrap(async (req, res) => {
    const old = await own("contact", req.params.id, req.user);
    res.json(
      await prisma.contact.update({
        where: { id: old.id },
        data: await contactData(req, old),
      }),
    );
  }),
);
router.delete(
  "/contacts/:id",
  manager,
  wrap(async (req, res) => {
    await own("contact", req.params.id, req.user);
    if (
      (await prisma.deal.count({
        where: { contactId: req.params.id, deletedAt: null, ...scope(req) },
      })) ||
      (await prisma.task.count({
        where: { contactId: req.params.id, deletedAt: null, ...scope(req) },
      }))
    )
      fail("Unlink or delete this contact's deals and tasks first.", 409);
    await prisma.contact.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), deletedBy: req.user.id },
    });
    res.status(204).end();
  }),
);
router.get(
  "/deals",
  wrap(async (req, res) => {
    const q = query(req);
    const where = {
      ...scope(req, "deal"),
      ...(q ? { title: contains(q) } : {}),
    };
    if (req.query.stageId)
      where.stageId = text(req.query.stageId, "Stage", 100);
    await list(
      res,
      "deal",
      where,
      listOptions(req, ["title", "value", "expectedCloseDate", "createdAt"]),
      dealInclude,
    );
  }),
);
async function dealData(req, old) {
  const b = req.body;
  const stage = await own("stage", b.stageId ?? old?.stageId, req.user);
  const previousStage = old ? await own("stage", old.stageId, req.user) : null;
  await own("contact", b.contactId ?? old?.contactId, req.user);
  return {
    title: text(b.title ?? old?.title, "Deal title"),
    contactId: b.contactId ?? old?.contactId,
    stageId: stage.id,
    value: money(b.value ?? old?.value?.toString()),
    expectedCloseDate:
      b.expectedCloseDate === undefined
        ? (old?.expectedCloseDate ?? null)
        : date(b.expectedCloseDate, "Expected close date"),
    closedAt:
      stage.kind === "OPEN"
        ? null
        : previousStage?.kind === stage.kind
          ? old.closedAt
          : new Date(),
  };
}
router.post(
  "/deals",
  wrap(async (req, res) => {
    res.status(201).json(
      await prisma.deal.create({
        data: { ...scope(req), ...(await dealData(req)) },
        include: dealInclude,
      }),
    );
  }),
);
router.patch(
  "/deals/:id",
  wrap(async (req, res) => {
    const old = await own("deal", req.params.id, req.user);
    res.json(
      await prisma.deal.update({
        where: { id: old.id },
        data: await dealData(req, old),
        include: dealInclude,
      }),
    );
  }),
);
router.delete(
  "/deals/:id",
  manager,
  wrap(async (req, res) => {
    await own("deal", req.params.id, req.user);
    if (
      await prisma.task.count({
        where: { dealId: req.params.id, deletedAt: null, ...scope(req) },
      })
    )
      fail("Unlink or delete this deal's tasks first.", 409);
    await prisma.deal.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), deletedBy: req.user.id },
    });
    res.status(204).end();
  }),
);
router.get(
  "/tasks",
  wrap(async (req, res) => {
    const q = query(req);
    const where = {
      ...scope(req, "task"),
      ...(q ? { title: contains(q) } : {}),
    };
    if (req.query.completed === "true" || req.query.completed === "false")
      where.completed = req.query.completed === "true";
    await list(
      res,
      "task",
      where,
      listOptions(req, ["title", "dueDate", "createdAt"]),
      taskInclude,
    );
  }),
);
async function taskData(req, old) {
  const b = req.body;
  const data = {
    title: text(b.title ?? old?.title, "Task title"),
    completed:
      b.completed === undefined ? (old?.completed ?? false) : b.completed,
    dueDate:
      b.dueDate === undefined
        ? (old?.dueDate ?? null)
        : date(b.dueDate, "Due date"),
    contactId:
      b.contactId === undefined
        ? (old?.contactId ?? null)
        : b.contactId || null,
    dealId: b.dealId === undefined ? (old?.dealId ?? null) : b.dealId || null,
  };
  data.assigneeId =
    b.assigneeId === undefined
      ? (old?.assigneeId ?? req.user.id)
      : b.assigneeId || req.user.id;
  if (req.user.role === "EMPLOYEE" && data.assigneeId !== req.user.id)
    fail("Employees can only assign work to themselves.", 403);
  const assignee = await prisma.user.findFirst({
    where: { id: data.assigneeId, ...memberScope(req.user), active: true },
  });
  if (!assignee) fail("Choose an active member of your team.", 403);
  if (typeof data.completed !== "boolean")
    fail("Completed must be true or false.");
  if (data.contactId && data.dealId)
    fail("Link a task to either a contact or a deal, not both.");
  if (data.contactId) await own("contact", data.contactId, req.user);
  if (data.dealId) await own("deal", data.dealId, req.user);
  // A task's assignee must also be allowed to view its linked record.
  for (const [model, id] of [
    ["contact", data.contactId],
    ["deal", data.dealId],
  ]) {
    if (
      id &&
      !(await prisma[model].findFirst({
        where: { id, ...recordScope(assignee, model) },
        select: { id: true },
      }))
    )
      fail(
        "The task assignee must have access to its linked record. Choose the contact owner or their team leader.",
      );
  }
  return data;
}
router.post(
  "/tasks",
  wrap(async (req, res) => {
    res.status(201).json(
      await prisma.task.create({
        data: { ...scope(req), ...(await taskData(req)) },
        include: taskInclude,
      }),
    );
  }),
);
router.patch(
  "/tasks/:id",
  wrap(async (req, res) => {
    const old = await own("task", req.params.id, req.user);
    res.json(
      await prisma.task.update({
        where: { id: old.id },
        data: await taskData(req, old),
        include: taskInclude,
      }),
    );
  }),
);
router.delete(
  "/tasks/:id",
  manager,
  wrap(async (req, res) => {
    await own("task", req.params.id, req.user);
    await prisma.task.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), deletedBy: req.user.id },
    });
    res.status(204).end();
  }),
);
router.get(
  "/search",
  wrap(async (req, res) => {
    const q = query(req);
    if (q.length < 2) return res.json({ contacts: [], deals: [], tasks: [] });
    const [contacts, deals, tasks] = await Promise.all([
      prisma.contact.findMany({
        where: {
          ...scope(req, "contact"),
          OR: ["name", "email", "phone"].map((k) => ({ [k]: contains(q) })),
        },
        take: 10,
        orderBy: { name: "asc" },
      }),
      prisma.deal.findMany({
        where: { ...scope(req, "deal"), title: contains(q) },
        take: 10,
        orderBy: { title: "asc" },
      }),
      prisma.task.findMany({
        where: { ...scope(req, "task"), title: contains(q) },
        take: 10,
        orderBy: { title: "asc" },
      }),
    ]);
    res.json({ contacts, deals, tasks });
  }),
);
for (const [plural, model, include] of [
  ["contacts", "contact", undefined],
  ["deals", "deal", dealInclude],
  ["tasks", "task", taskInclude],
]) {
  router.get(
    "/" + plural + "/:id",
    wrap(async (req, res) => {
      const record = await prisma[model].findFirst({
        where: { ...scope(req, model), id: req.params.id },
        include,
      });
      if (!record) fail("Record not found.", 404);
      res.json(record);
    }),
  );
}
router.get(
  "/dashboard",
  wrap(async (req, res) => {
    const orgId = req.user.orgId,
      now = new Date();
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
    );
    const today = date(
      req.query.today || now.toISOString().slice(0, 10),
      "Today",
    );
    const result = await prisma.$transaction(
      async (tx) => {
        const contacts = await tx.contact.count({
          where: { ...scope(req, "contact") },
        });
        const activeDeals = await tx.deal.count({
          where: { ...scope(req, "deal"), stage: { kind: "OPEN" } },
        });
        const won = await tx.deal.aggregate({
          where: {
            ...scope(req, "deal"),
            stage: { kind: "WON" },
            closedAt: { gte: month, lt: nextMonth },
          },
          _sum: { value: true },
        });
        const openValue = await tx.deal.aggregate({
          where: { ...scope(req, "deal"), stage: { kind: "OPEN" } },
          _sum: { value: true },
        });
        const pendingTasks = await tx.task.count({
          where: { ...scope(req, "task"), completed: false },
        });
        const dueTasks = await tx.task.findMany({
          where: { ...scope(req, "task"), completed: false, dueDate: today },
          take: 8,
          orderBy: { createdAt: "asc" },
          include: taskInclude,
        });
        const dueCount = await tx.task.count({
          where: { ...scope(req, "task"), completed: false, dueDate: today },
        });
        const stages = await tx.stage.findMany({
          where: { orgId },
          orderBy: [{ position: "asc" }, { name: "asc" }],
        });
        const groups = await tx.deal.groupBy({
          by: ["stageId"],
          where: { ...scope(req, "deal") },
          _count: { _all: true },
          _sum: { value: true },
        });
        const wins = await tx.deal.groupBy({
          by: ["closedAt"],
          where: {
            ...scope(req, "deal"),
            stage: { kind: "WON" },
            closedAt: { gte: start, lt: nextMonth },
          },
          _count: { _all: true },
          _sum: { value: true },
        });
        const monthly = [];
        for (const win of wins) {
          const key = win.closedAt.toISOString().slice(0, 7);
          let bucket = monthly.find((m) => m.month === key);
          if (!bucket)
            monthly.push(
              (bucket = { month: key, count: 0, value: new Prisma.Decimal(0) }),
            );
          bucket.count += win._count._all;
          bucket.value = bucket.value.plus(win._sum.value || 0);
        }
        return {
          kpis: {
            contacts,
            activeDeals,
            wonThisMonth: won._sum.value?.toString() || "0",
            openValue: openValue._sum.value?.toString() || "0",
            pendingTasks,
          },
          pipeline: stages.map((s) => {
            const g = groups.find((g) => g.stageId === s.id);
            return {
              ...s,
              count: g?._count._all || 0,
              value: g?._sum.value?.toString() || "0",
            };
          }),
          monthly: Array.from({ length: 6 }, (_, i) => {
            const key = new Date(
              Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
            )
              .toISOString()
              .slice(0, 7);
            return (
              monthly.find((m) => m.month === key) || {
                month: key,
                count: 0,
                value: "0",
              }
            );
          }),
          dueTasks,
          dueCount,
          generatedAt: now.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    res.json(result);
  }),
);
module.exports = router;
