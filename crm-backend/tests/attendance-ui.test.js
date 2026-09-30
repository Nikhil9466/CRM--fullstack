const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the actual browser helpers and event handlers without database writes.
function frontend() {
  const handlers = {};
  const input = () => ({ value: "", dataset: {}, focus() {} });
  const form = {
    elements: { workDate: input(), checkIn: input(), checkOut: input() },
    scrollIntoView() {},
  };
  const nodes = {
    content: {
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
    },
    attendanceCorrection: form,
    attBreakInputs: { innerHTML: "" },
  };
  const context = vm.createContext({
    state: { user: { id: "admin", name: "QA Admin", role: "ADMIN" } },
    Date,
    Intl,
    console,
    setInterval() {},
    document: { addEventListener() {} },
    $: (id) => nodes[id],
    esc: (value) => String(value ?? "").replaceAll('"', "&quot;"),
  });
  context.isAdmin = () => context.state.user.role === "ADMIN";
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../../front end/attendance.js"),
      "utf8",
    ),
    context,
  );
  return { context, handlers, nodes };
}

test("unchanged correction times retain seconds and milliseconds; edited values are parsed anew", () => {
  const { context } = frontend();
  const original = "2026-09-23T09:45:01.123Z";
  context.original = original;
  assert.equal(
    vm.runInContext("attInputUTC(attLocalInput(original), original)", context),
    original,
  );
  const parsed = vm.runInContext(
    "attInputUTC(attLocalInput(original))",
    context,
  );
  assert.equal(new Date(parsed).getUTCSeconds(), 0);
  assert.equal(new Date(parsed).getUTCMilliseconds(), 0);
  const html = vm.runInContext(
    'attBreakRow(original, "2026-09-23T10:00:11.456Z")',
    context,
  );
  assert.match(html, /data-original-utc="2026-09-23T09:45:01.123Z"/);
});

test("editing a correction input drops its preserved timestamp", () => {
  const { handlers } = frontend();
  const target = { dataset: { originalUtc: "2026-09-23T09:45:01.123Z" } };
  handlers.input({ target });
  assert.equal(target.dataset.originalUtc, undefined);
});

test("expired open shifts offer a correction even outside the selected history range", async () => {
  const { context, handlers, nodes } = frontend();
  const open = {
    workDate: "2026-01-01",
    checkIn: "2026-01-01T09:30:11.123Z",
    checkOut: null,
    status: "Working",
    attendanceStatus: "Present",
    needsCorrection: true,
    actionsExpired: true,
    workedSeconds: 86400,
    breakSeconds: 0,
    breaks: [],
    policy: {
      startTime: "09:30",
      endTime: "18:00",
      timeZone: "UTC",
      expectedMinutes: 480,
    },
  };
  context.open = open;
  const html = vm.runInContext("attTodayCard({open, today:open})", context);
  assert.match(html, /data-att-correct="2026-01-01"/);
  assert.doesNotMatch(html, /data-att-action=/);
  vm.runInContext("attendanceHistory=[]; attendanceToday={open};", context);
  await handlers.click({
    target: {
      closest: () => ({
        dataset: { attCorrect: open.workDate },
        hasAttribute: () => false,
      }),
    },
  });
  assert.equal(
    nodes.attendanceCorrection.elements.workDate.value,
    open.workDate,
  );
  assert.equal(
    nodes.attendanceCorrection.elements.checkIn.dataset.originalUtc,
    open.checkIn,
  );
});

test("admins see self-approval and resume controls; employees and leaders cannot resume", () => {
  const { context } = frontend();
  context.record = { id: "record", version: 3, canResume: true };
  assert.match(
    vm.runInContext("attResumeButton(record)", context),
    /data-att-version="3"/,
  );
  context.request = {
    id: "request",
    userId: "admin",
    user: { name: "QA Admin" },
    workDate: "2026-09-23",
    proposed: {
      checkIn: "2026-09-23T09:30:00Z",
      checkOut: "2026-09-23T18:00:00Z",
      breaks: [],
    },
    status: "PENDING",
    reason: "Forgot checkout",
  };
  assert.match(
    vm.runInContext(
      "attRequests({items:[request],total:1,page:1,pageSize:50},true)",
      context,
    ),
    /value="APPROVED"/,
  );
  for (const role of ["EMPLOYEE", "SUB_ADMIN"]) {
    context.state.user.role = role;
    assert.equal(vm.runInContext("attResumeButton(record)", context), "");
  }
  context.state.user.role = "ADMIN";
  context.record.employee = { active: false };
  assert.equal(vm.runInContext("attResumeButton(record)", context), "");
});
