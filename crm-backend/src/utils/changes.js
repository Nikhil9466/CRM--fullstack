const { AsyncLocalStorage } = require("node:async_hooks");
const prisma = require("../config/prisma");
const { fail } = require("./input");
const context = new AsyncLocalStorage();
// Routes share their transaction, including helpers that already use $transaction.
// Reads outside a mutation keep normal Prisma transaction behavior.
const db = new Proxy(prisma, {
  get(target, key) {
    const tx = context.getStore();
    if (tx && key === "$transaction")
      return async (fn) => {
        if (typeof fn !== "function")
          throw new Error("Nested transactions must use a callback.");
        return fn(tx);
      };
    const client = tx || target,
      value = client[key];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
const models = {
  contacts: "contact",
  deals: "deal",
  tasks: "task",
  members: "user",
  "member-passwords": "user",
  password: "user",
  stages: "stage",
  teams: "team",
  "team-requests": "teamRequest",
};
const fields = {
  contacts: ["name", "assigneeId"],
  deals: ["title", "contactId", "stageId", "value", "expectedCloseDate"],
  tasks: ["title", "assigneeId", "completed", "dueDate", "contactId", "dealId"],
  members: ["name", "role", "active"],
  teams: ["name", "leaderId"],
  stages: ["name", "position", "kind"],
  "team-requests": ["status"],
};
async function eventFor(tx, req, result, before) {
  if (req.attendanceAudit)
    return {
      orgId: req.user.orgId,
      actorId: req.user.id,
      actorName: req.user.name,
      ...req.attendanceAudit,
    };
  const parts = req.path.split("/").filter(Boolean),
    root = parts[0];
  let entityType = models[root],
    entityId = req.params.id || result?.id || null;
  let action = { POST: "created", PATCH: "updated", DELETE: "deleted" }[
    req.method
  ];
  if (root === "recycle-bin") {
    entityType = models[parts[1]];
    action = "restored";
  }
  if (root === "password" || root === "member-passwords") {
    action = "password_changed";
    entityId = req.params.id || req.user.id;
  }
  if (root === "teams" && parts[2] === "members")
    action = req.method === "DELETE" ? "member_removed" : "member_assigned";
  if (root === "teams" && parts[2] === "requests") {
    action = "addition_requested";
    entityType = "teamRequest";
    entityId = result?.id;
  }
  if (root === "team-requests")
    action =
      req.body.status === "APPROVED" ? "request_approved" : "request_rejected";
  if (req.method === "DELETE" && ["contacts", "deals", "tasks"].includes(root))
    action = "recycled";
  if (!entityType)
    throw new Error("Mutation is missing an activity definition.");
  const details = {};
  const allowed =
    root === "teams" && parts[2] ? ["employeeId"] : fields[root] || [];
  for (const key of allowed)
    if (req.method !== "DELETE" && req.body?.[key] !== undefined) {
      const raw =
        result && Object.hasOwn(result, key) ? result[key] : req.body[key];
      const value = raw?.toJSON ? raw.toJSON() : raw;
      if (
        value === null ||
        ["string", "number", "boolean"].includes(typeof value)
      )
        details[key] = value;
    }
  if (root === "team-requests" && before) {
    details.employeeId = before.employeeId;
    details.teamId = before.teamId;
  }

  if (req.params.employeeId) details.employeeId = req.params.employeeId;
  if (root === "teams" && parts[2]) details.teamId = req.params.id;
  // Only allowlisted, useful prior values; never passwords, hashes or session secrets.
  if (before) {
    const previous = {};
    for (const key of Object.keys(details))
      if (before[key] !== undefined) previous[key] = before[key];
    if (Object.keys(previous).length) details.previous = previous;
  }
  const references = {};
  for (const [key, model] of Object.entries({
    assigneeId: "user",
    leaderId: "user",
    employeeId: "user",
    teamId: "team",
    contactId: "contact",
    dealId: "deal",
    stageId: "stage",
  })) {
    for (const id of [details[key], details.previous?.[key]])
      if (typeof id === "string" && id && !references[id]) {
        const record = await tx[model].findFirst({
          where: { id, orgId: req.user.orgId },
        });
        if (record) references[id] = record.name || record.title;
      }
  }
  if (Object.keys(references).length) details.references = references;
  const requestLabel =
    entityType === "teamRequest"
      ? `Request for ${references[details.employeeId] || details.employeeId || "employee"} → ${references[details.teamId] || details.teamId || "team"}`
      : null;
  return {
    orgId: req.user.orgId,
    actorId: req.user.id,
    actorName: req.user.name,
    action,
    entityType,
    entityId,
    entityLabel:
      requestLabel ||
      before?.name ||
      before?.title ||
      result?.name ||
      result?.title ||
      entityId ||
      entityType,
    details: JSON.parse(JSON.stringify(details)),
  };
}
function wrap(fn) {
  return (req, res, next) =>
    Promise.resolve()
      .then(async () => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method))
          return fn(req, res);
        let status = 200,
          payload,
          ended = false;
        const response = {
          status(n) {
            status = n;
            return this;
          },
          json(value) {
            payload = value;
            return this;
          },
          end() {
            ended = true;
            return this;
          },
        };
        await prisma.$transaction(
          async (tx) => {
            // Serialize organisation writes so delete/link/restore and membership changes cannot race.
            await tx.$queryRawUnsafe(
              'SELECT "id" FROM "Organisation" WHERE "id" = $1 FOR UPDATE',
              req.user.orgId,
            );
            const actor = await tx.user.findFirst({
              where: { id: req.user.id, orgId: req.user.orgId, active: true },
            });
            if (!actor)
              fail("Your account is unavailable. Sign in again.", 401);
            const session = await tx.session.findUnique({
              where: { idHash: req.session.idHash },
            });
            if (
              !session ||
              session.sessionVersion !== actor.sessionVersion ||
              session.expiresAt <= new Date()
            )
              fail("Please sign in again.", 401);
            if (
              actor.role !== req.user.role ||
              actor.teamId !== req.user.teamId
            )
              fail("Your permissions changed. Refresh and retry.", 409);
            const parts = req.path.split("/").filter(Boolean),
              model =
                models[parts[0]] ||
                (parts[0] === "recycle-bin" ? models[parts[1]] : null);
            const id =
              req.params.id || (parts[0] === "password" ? req.user.id : null);
            const before =
              model && id
                ? await tx[model].findFirst({
                    where: { id, orgId: req.user.orgId },
                  })
                : null;
            await context.run(tx, () => fn(req, response));
            await tx.activity.create({
              data: await eventFor(tx, req, payload, before),
            });
          },
          { maxWait: 10000, timeout: 15000 },
        );
        if (ended) res.status(status).end();
        else res.status(status).json(payload);
      })
      .catch(next);
}
module.exports = { db, wrap };
