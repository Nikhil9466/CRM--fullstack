"use strict";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const currency = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(v));
const compactMoney = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(v));
const dateLabel = (v) =>
  v
    ? new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
const state = {
  user: null,
  stages: [],
  members: [],
  view: "overview",
  page: 1,
  filters: {},
  items: [],
  version: 0,
};
const roleLabel = (role) =>
  ({ ADMIN: "Admin", SUB_ADMIN: "Sub-admin", EMPLOYEE: "Employee" })[role] ||
  role;
const isManager = () => ["ADMIN", "SUB_ADMIN"].includes(state.user?.role);
const isAdmin = () => state.user?.role === "ADMIN";
async function logout() {
  try {
    await window.crmSession.logout();
  } catch (err) {
    notice(err.message, true);
  }
}
async function api(path, method = "GET", body) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await window.crmSession.request("/api" + path, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "The request could not be completed.");
    return data;
  } catch (err) {
    if (err.name === "AbortError")
      throw new Error("The server took too long. Please retry.");
    if (err instanceof TypeError)
      throw new Error(
        "Cannot reach the server. Check your connection and refresh.",
      );
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").className = "notice" + (error ? " error" : "");
  $("notice").hidden = false;
}
function theme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem("vb-theme", mode);
  $("theme").innerHTML =
    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (mode === "dark"
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42"/>'
      : '<path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z"/>') +
    "</svg>";
  $("theme").title =
    mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  $("theme").setAttribute(
    "aria-label",
    "Switch to " + (mode === "dark" ? "light" : "dark") + " mode",
  );
}
theme(
  localStorage.getItem("vb-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
);
$("theme").onclick = () =>
  theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
$("logout").onclick = () => logout();
$("menu").onclick = () => {
  const open = $("sidebar").classList.toggle("open");
  $("menu").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", (e) => {
  if (!$("sidebar").contains(e.target) && !$("menu").contains(e.target)) {
    $("sidebar").classList.remove("open");
    $("menu").setAttribute("aria-expanded", "false");
  }
  if (!e.target.closest(".search-wrap")) $("searchResults").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("searchResults").hidden = true;
    $("sidebar").classList.remove("open");
    $("menu").setAttribute("aria-expanded", "false");
  }
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $("globalSearch").focus();
  }
});
function quick(type, title, subtitle) {
  return (
    '<button class="quick" data-new="' +
    type +
    '"><span>+</span><div><strong>' +
    title +
    "</strong><small>" +
    subtitle +
    "</small></div><span>↗</span></button>"
  );
}
function renderDashboard(d) {
  const kpis = [
    ["Total contacts", d.kpis.contacts, "♧", "People in your shared workspace"],
    [
      "Active deals",
      d.kpis.activeDeals,
      "▥",
      compactMoney(d.kpis.openValue) + " in open pipeline",
    ],
    [
      "Won this month",
      compactMoney(d.kpis.wonThisMonth),
      "↗",
      "Value of deals won · UTC month",
    ],
    ["Pending tasks", d.kpis.pendingTasks, "☑", d.dueCount + " due today"],
  ];
  const max = Math.max(1, ...d.monthly.map((m) => m.count));
  const totalWins = d.monthly.reduce((n, m) => n + m.count, 0);
  const maxStage = Math.max(1, ...d.pipeline.map((s) => s.count));
  const bars = d.monthly
    .map(
      (m) =>
        '<div class="bar-column" title="' +
        esc(m.month + ": " + m.count + " deals, " + currency(m.value)) +
        '"><span class="bar-value">' +
        m.count +
        '</span><div class="bar" style="height:' +
        (m.count / max) * 175 +
        'px"></div></div>',
    )
    .join("");
  const labels = d.monthly
    .map(
      (m) =>
        "<span>" +
        new Date(m.month + "-01T12:00:00Z").toLocaleDateString("en", {
          month: "short",
          timeZone: "UTC",
        }) +
        "</span>",
    )
    .join("");
  const pipeline = d.pipeline
    .map(
      (s) =>
        '<div class="stage-row" data-kind="' +
        esc(s.kind) +
        '"><div class="stage-info"><span>' +
        esc(s.name) +
        "<small>" +
        s.count +
        " deals</small></span><strong>" +
        esc(compactMoney(s.value)) +
        '</strong></div><div class="track"><span style="width:' +
        (s.count / maxStage) * 100 +
        '%"></span></div></div>',
    )
    .join("");
  const tasks = d.dueTasks
    .map(
      (t) =>
        '<label class="task-row"><input type="checkbox" data-complete="' +
        esc(t.id) +
        '" aria-label="' +
        esc("Complete " + t.title) +
        '"><span><strong>' +
        esc(t.title) +
        "</strong><small>" +
        esc(t.contact?.name || t.deal?.title || "General task") +
        "</small></span></label>",
    )
    .join("");
  $("content").innerHTML =
    '<div class="kpis">' +
    kpis
      .map(
        (k) =>
          '<article class="kpi"><div class="kpi-top"><span>' +
          k[0] +
          '</span><span class="kpi-icon">' +
          k[2] +
          '</span></div><p class="kpi-value">' +
          esc(k[1]) +
          '</p><p class="kpi-foot">' +
          esc(k[3]) +
          "</p></article>",
      )
      .join("") +
    "</div>" +
    '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>A little progress, every month</h2><small>Deals won over the last six months</small></div><span class="pill">Last 6 months</span></div><div class="chart" role="img" aria-label="' +
    esc(d.monthly.map((m) => m.month + ": " + m.count + " wins").join("; ")) +
    '">' +
    bars +
    '</div><div class="chart-labels">' +
    labels +
    "</div>" +
    (totalWins
      ? ""
      : '<p class="chart-note">No wins yet. Move a deal to a Won-type stage to start tracking.</p>') +
    '<div class="chart-summary"><span><strong>' +
    totalWins +
    "</strong> deals won in this period</span><span>Monthly totals · UTC</span></div></section>" +
    '<section class="panel"><div class="panel-head"><div><h2>Your pipeline</h2><small>Every deal, a step closer</small></div><span class="pill">All time</span></div><div class="pipeline">' +
    (pipeline ||
      '<p class="empty">Ask an admin to create pipeline stages.</p>') +
    '</div><a class="panel-link" href="#deals">Explore deals <span>↗</span></a></section></div>' +
    '<div class="bottom-grid"><section class="panel"><div class="panel-head"><div><h2>On your list today</h2><small>' +
    esc(dateLabel(today())) +
    " · " +
    d.dueCount +
    ' pending</small></div><span class="pill">Team tasks</span></div><div class="tasks-list">' +
    (tasks ||
      '<div class="empty">A clear list for today.<br>Add a task when there’s a next step to take.</div>') +
    '</div><a class="panel-link" href="#tasks">View all tasks' +
    (d.dueCount > 8 ? " · Showing first 8" : "") +
    ' ↗</a></section><section class="panel"><div class="panel-head"><div><h2>Make your next move</h2><small>Small actions. Stronger relationships.</small></div></div><div class="quick-grid">' +
    quick("contacts", "Add a contact", "Start a new relationship") +
    quick("deals", "Create a deal", "Turn a conversation into an opportunity") +
    quick("tasks", "Plan a task", "Give your next step a place") +
    "</div></section></div>";
}
const opt = (value, label, selected) =>
  '<option value="' +
  esc(value) +
  '"' +
  (String(selected ?? "") === String(value) ? " selected" : "") +
  ">" +
  esc(label) +
  "</option>";
function actionButtons(type, item) {
  return (
    '<button class="text-button" data-edit="' +
    type +
    '" data-id="' +
    esc(item.id) +
    '">Edit</button>' +
    ((type === "stages" ? isAdmin() : isManager())
      ? '<button class="text-button danger" data-delete="' +
        type +
        '" data-id="' +
        esc(item.id) +
        '">Delete</button>'
      : "")
  );
}
function filtersHtml(type) {
  const f = state.filters;
  let html =
    '<form id="filtersForm" class="filters"><label>Search<input name="q" placeholder="' +
    (type === "contacts" ? "Name, email or phone" : "Title") +
    '" value="' +
    esc(f.q) +
    '"></label>';
  if (type === "contacts")
    html +=
      '<label>Organisation / company<input name="company" value="' +
      esc(f.company) +
      '" placeholder="Any company"></label><label>Added from<input type="date" name="from" value="' +
      esc(f.from) +
      '"></label><label>Added through<input type="date" name="to" value="' +
      esc(f.to) +
      '"></label>';
  if (type === "deals")
    html +=
      '<label>Pipeline stage<select name="stageId">' +
      opt("", "All stages", f.stageId) +
      state.stages.map((s) => opt(s.id, s.name, f.stageId)).join("") +
      "</select></label>";
  if (type === "tasks")
    html +=
      '<label>Status<select name="completed">' +
      opt("", "All tasks", f.completed) +
      opt("false", "Pending", f.completed) +
      opt("true", "Completed", f.completed) +
      "</select></label>";
  const sorts =
    type === "contacts"
      ? [
          ["createdAt", "Date added"],
          ["name", "Name"],
          ["company", "Company"],
        ]
      : type === "deals"
        ? [
            ["createdAt", "Date added"],
            ["value", "Value"],
            ["expectedCloseDate", "Close date"],
          ]
        : [
            ["createdAt", "Date added"],
            ["dueDate", "Due date"],
          ];
  html +=
    '<label>Sort by<select name="sort">' +
    sorts.map((s) => opt(s[0], s[1], f.sort || "createdAt")).join("") +
    '</select></label><label>Order<select name="direction">' +
    opt("desc", "Descending", f.direction || "desc") +
    opt("asc", "Ascending", f.direction) +
    '</select></label><button class="button" type="submit">Apply</button><button class="text-button" type="button" id="clearFilters">Clear</button></form>';
  return html;
}
function renderList(type, data) {
  state.items = data.items;
  const headers =
    type === "contacts"
      ? ["Contact", "Company", "Phone", "Assigned to", "Added", ""]
      : type === "deals"
        ? ["Deal", "Contact", "Value", "Stage", "Expected close", ""]
        : ["Task", "Linked record", "Assigned to", "Due date", "Status", ""];
  const rows = data.items
    .map((item) => {
      let cells;
      if (type === "contacts")
        cells = [
          "<strong>" +
            esc(item.name) +
            "</strong><small>" +
            esc(item.email || "No email") +
            "</small>",
          esc(item.company || "—"),
          esc(item.phone || "—"),
          esc(
            state.members.find((m) => m.id === item.assigneeId)?.name ||
              "Unassigned",
          ),
          dateLabel(item.createdAt),
        ];
      else if (type === "deals")
        cells = [
          "<strong>" + esc(item.title) + "</strong>",
          esc(item.contact.name),
          esc(currency(item.value)),
          '<select aria-label="' +
            esc("Stage for " + item.title) +
            '" data-stage="' +
            esc(item.id) +
            '">' +
            state.stages.map((s) => opt(s.id, s.name, item.stageId)).join("") +
            "</select>",
          dateLabel(item.expectedCloseDate),
        ];
      else
        cells = [
          "<strong>" + esc(item.title) + "</strong>",
          esc(item.contact?.name || item.deal?.title || "—"),
          esc(
            state.members.find((m) => m.id === item.assigneeId)?.name ||
              "Unassigned",
          ),
          dateLabel(item.dueDate),
          '<label class="check-line"><input type="checkbox" data-complete="' +
            esc(item.id) +
            '"' +
            (item.completed ? " checked" : "") +
            ' aria-label="' +
            esc("Complete " + item.title) +
            '"><span>' +
            (item.completed ? "Complete" : "Pending") +
            "</span></label>",
        ];
      return (
        "<tr>" +
        [...cells, actionButtons(type, item)]
          .map((c) => "<td>" + c + "</td>")
          .join("") +
        "</tr>"
      );
    })
    .join("");
  $("content").innerHTML =
    '<section class="panel">' +
    filtersHtml(type) +
    '<div class="table-wrap"><table><thead><tr>' +
    headers.map((h) => '<th scope="col">' + h + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></div>" +
    (rows
      ? ""
      : '<div class="empty">No ' +
        type +
        " found.<br>Add a record or try different filters.</div>") +
    '<div class="pager"><span>' +
    data.total +
    " records · Page " +
    data.page +
    " of " +
    Math.max(1, Math.ceil(data.total / data.pageSize)) +
    '</span><div><button class="button" id="prevPage"' +
    (data.page <= 1 ? " disabled" : "") +
    '>Previous</button><button class="button" id="nextPage"' +
    (data.page * data.pageSize >= data.total ? " disabled" : "") +
    ">Next</button></div></div></section>";
  $("filtersForm").onsubmit = (e) => {
    e.preventDefault();
    state.filters = Object.fromEntries(new FormData(e.target));
    state.page = 1;
    loadView();
  };
  $("clearFilters").onclick = () => {
    state.filters = {};
    state.page = 1;
    loadView();
  };
  $("prevPage").onclick = () => {
    state.page--;
    loadView();
  };
  $("nextPage").onclick = () => {
    state.page++;
    loadView();
  };
}
function renderProfile() {
  const u = state.user;
  const details = [
    ["Full name", u.name],
    ["Email address", u.email],
    ["Phone number", u.phone],
    ["Role", roleLabel(u.role)],
    ["Organisation", u.orgId],
    ["Team", u.team?.name || "Not assigned to a team"],
    ["Account status", u.active ? "Active" : "Inactive"],
    ["Member since", dateLabel(u.createdAt)],
  ];
  $("content").innerHTML =
    `<section class="panel profile-panel"><div class="profile-summary"><span class="avatar profile-avatar">${esc($("avatar").textContent)}</span><div><h2>${esc(u.name)}</h2><p>${esc(u.email)}</p><span class="badge">${esc(roleLabel(u.role))}</span></div></div><dl class="profile-details">${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value || "—")}</dd></div>`).join("")}</dl><div class="profile-security"><div><h3>Account security</h3><p>Keep your account protected with a strong password.</p></div><div class="profile-account-actions"><a href="account.html" class="button">Change password</a><button class="button" data-switch-account="true">Switch account</button></div></div></section>`;
}
function memberRows() {
  return state.members
    .map(
      (m) =>
        `<tr><td><strong>${esc(m.name)}</strong><small>${esc(m.email)}</small></td><td>${isAdmin() && m.id !== state.user.id ? `<select aria-label="Role for ${esc(m.name)}" data-member-role="${esc(m.id)}">${["EMPLOYEE", "SUB_ADMIN", "ADMIN"].map((r) => opt(r, roleLabel(r), m.role)).join("")}</select>` : esc(roleLabel(m.role))}</td><td>${esc(state.teams?.find((t) => t.id === m.teamId)?.name || "Unassigned")}</td><td><span class="badge">${m.active ? "Active" : "Inactive"}</span></td><td>${isAdmin() && m.id !== state.user.id ? `<button class="text-button" data-reset-password="${esc(m.id)}">Reset password</button><button class="text-button danger" data-active="${esc(m.id)}">${m.active ? "Deactivate" : "Activate"}</button>` : ""}${m.teamId && m.role === "EMPLOYEE" ? `<button class="text-button danger" data-remove-member="${esc(m.id)}" data-team="${esc(m.teamId)}">Remove from team</button>` : ""}</td></tr>`,
    )
    .join("");
}

function renderHistory(data) {
  const activity = state.view === "activity";
  const types = activity
    ? {
        "": "All types",
        contact: "Contacts",
        deal: "Deals",
        task: "Tasks",
        user: "People & access",
        team: "Teams",
        teamRequest: "Team requests",
        stage: "Pipeline stages",
        attendance: "Attendance",
      }
    : { contacts: "Contacts", deals: "Deals", tasks: "Tasks" };
  const actions = {
    attendance_policy_updated: "Attendance policy updated",
    attendance_correction_requested: "Attendance correction requested",
    attendance_correction_approved: "Attendance correction approved",
    attendance_correction_rejected: "Attendance correction rejected",
    attendance_check_in: "Checked in",
    attendance_start_break: "Started break",
    attendance_end_break: "Ended break",
    attendance_check_out: "Checked out",
    attendance_resumed: "Resumed work",
    created: "Created",
    updated: "Updated",
    deleted: "Deleted",
    recycled: "Moved to recycle bin",
    restored: "Restored",
    password_changed: "Password changed",
    member_removed: "Removed from team",
    member_assigned: "Assigned to team",
    addition_requested: "Requested team addition",
    request_approved: "Approved team request",
    request_rejected: "Rejected team request",
  };
  const fields = {
    resumedAt: "Resumed at (UTC)",
    workDate: "Workday",
    checkIn: "Check in (UTC)",
    checkOut: "Check out (UTC)",
    breaks: "Break periods (UTC)",
    reason: "Reason",
    reviewNote: "Review note",
    workingDays: "Working days (0=Sun)",
    timeZone: "Workspace timezone",
    startTime: "Work start",
    endTime: "Work end",
    graceMinutes: "Late grace (minutes)",
    expectedMinutes: "Expected minutes",
    name: "Name",
    title: "Title",
    role: "Role",
    active: "Active",
    teamId: "Team",
    leaderId: "Team leader",
    employeeId: "Employee",
    status: "Decision",
    assigneeId: "Assigned to",
    contactId: "Contact",
    dealId: "Deal",
    stageId: "Stage",
    value: "Value",
    completed: "Completed",
    dueDate: "Due date",
    expectedCloseDate: "Expected close",
    position: "Position",
    kind: "Outcome",
  };
  const showValue = (v, refs) =>
    v === null
      ? "Unassigned"
      : (refs && Object.hasOwn(refs, v) ? refs[v] : null) ||
        (typeof v === "boolean"
          ? v
            ? "Yes"
            : "No"
          : String(v).replaceAll("_", " "));
  const rows = data.items
    .map((item) => {
      if (!activity)
        return `<tr><td><strong>${esc(item.label)}</strong></td><td>${esc(new Date(item.deletedAt).toLocaleString())}</td><td>${esc(item.deletedByName)}</td><td><button class="button" data-restore="${esc(item.id)}" data-type="${esc(data.type)}">Restore</button></td></tr>`;
      const details = Object.entries(item.details)
        .filter(([key]) => fields[key])
        .map(
          ([key, value]) =>
            `<div><strong>${esc(fields[key])}:</strong> ${item.details.previous && Object.hasOwn(item.details.previous, key) ? esc(showValue(item.details.previous[key], item.details.references)) + " → " : ""}${esc(showValue(value, item.details.references))}</div>`,
        )
        .join("");
      return `<tr><td>${esc(new Date(item.createdAt).toLocaleString())}</td><td>${esc(item.actorName)}</td><td>${esc(actions[item.action] || item.action)}</td><td><strong>${esc(item.entityLabel)}</strong><small>${esc(types[item.entityType] || item.entityType)}</small></td><td>${details || "—"}</td></tr>`;
    })
    .join("");
  $("content").innerHTML =
    `<div class="settings-grid"><a href="#settings" class="text-button">← Team & settings</a><section class="panel"><form id="historyFilters" class="filters"><label>Record type<select name="type">${Object.entries(
      types,
    )
      .map(
        ([value, label]) =>
          `<option value="${value}"${(state.filters.type || (activity ? "" : "contacts")) === value ? " selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Search<input name="q" maxlength="120" value="${esc(state.filters.q || "")}" placeholder="${activity ? "Person, record or action" : "Record name"}"></label>${activity ? `<label>From<input type="date" name="from" value="${esc(state.filters.from || "")}"></label><label>To<input type="date" name="to" value="${esc(state.filters.to || "")}"></label>` : ""}<button class="button" type="submit">Apply filters</button><button class="text-button" type="button" id="clearHistory">Clear</button></form><p class="history-note">${activity ? "Only admins can view organisation history. Date filters use UTC. Passwords and session secrets are never recorded." : "Records stay here until restored. Restoring keeps their original assignments. Your current team permissions apply."}</p><div class="table-wrap"><table><thead><tr>${(activity ? ["When", "Changed by", "Action", "Record", "Details"] : ["Record", "Deleted on", "Deleted by", ""]).map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${activity ? 5 : 4}" class="empty">${activity ? "No activity matches these filters." : "No deleted records match these filters."}</td></tr>`}</tbody></table></div><div class="pager"><span>${data.total} records · Page ${data.page} of ${Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div><button class="button" id="historyPrev"${data.page <= 1 ? " disabled" : ""}>Previous</button><button class="button" id="historyNext"${data.page * data.pageSize >= data.total ? " disabled" : ""}>Next</button></div></div></section></div>`;
  $("historyFilters").onsubmit = (e) => {
    e.preventDefault();
    state.filters = Object.fromEntries(new FormData(e.target));
    state.page = 1;
    loadView();
  };
  $("clearHistory").onclick = () => {
    state.filters = {};
    state.page = 1;
    loadView();
  };
  $("historyPrev").onclick = () => {
    state.page--;
    loadView();
  };
  $("historyNext").onclick = () => {
    state.page++;
    loadView();
  };
}

function renderSettings() {
  const stages = state.stages
    .map(
      (s) =>
        `<tr><td>${esc(s.name)}</td><td>${esc(s.kind)}</td><td>${s.position}</td><td>${actionButtons("stages", s)}</td></tr>`,
    )
    .join("");
  $("content").innerHTML =
    `<div class="settings-grid"><div class="team-toolbar"><a class="button" href="#recycle-bin">Recycle bin</a>${isAdmin() ? '<a class="button" href="#activity">Activity history</a>' : ""}</div><a class="panel team-overview-link" href="#teams"><div><p class="eyebrow">TEAM MANAGEMENT</p><h2>Teams & performance</h2><p>${isAdmin() ? "Manage teams, review employee requests, and compare performance across your organisation." : "Manage your team, request employees, and follow everyone's progress."}</p></div><span aria-hidden="true">↗</span></a><section class="panel"><div class="panel-head people-access-head"><div><h2>${isAdmin() ? "People & access" : "Your team members"}</h2><small>${isAdmin() ? "Create employee creates a new CRM account. Assign existing employees and appoint team leaders under Teams & performance." : "Remove employees here, or request additions from Teams & performance."}</small></div>${isAdmin() ? '<button class="button primary" data-new="members">+ Create employee</button>' : ""}</div><div class="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Team</th><th>Status</th><th>Actions</th></tr></thead><tbody>${memberRows()}</tbody></table></div></section>${isAdmin() ? `<section class="panel"><div class="panel-head"><div><h2>Pipeline stages</h2><small>Shared across the organisation. Outcome types stay fixed to protect reports.</small></div><button class="button" data-new="stages">+ Add stage</button></div><div class="table-wrap"><table><thead><tr><th>Stage</th><th>Outcome</th><th>Position</th><th>Actions</th></tr></thead><tbody>${stages}</tbody></table></div></section>` : ""}</div>`;
  $("content")
    .querySelector(".settings-grid")
    .insertAdjacentHTML("beforeend", attendanceSettingsPanel());
}
function performanceTable(rows, team = false) {
  return `<div class="table-wrap"><table><thead><tr><th>${team ? "Team" : "Employee"}</th><th>${team ? "People" : "Team / role"}</th><th>Contacts</th><th>Deals</th><th>Won</th><th>Won value</th><th>Tasks completed</th></tr></thead><tbody>${rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong>${!team && !r.active ? "<small>Inactive</small>" : ""}</td><td>${team ? r.members : `${esc(state.teams.find((t) => t.id === r.teamId)?.name || "Unassigned")}<small>${esc(roleLabel(r.role))}</small>`}</td><td>${r.contacts}</td><td>${r.deals}</td><td>${r.won}</td><td>${esc(currency(r.revenue))}</td><td><span>${r.completed} / ${r.tasks}</span><div class="track performance-track"><span style="width:${r.tasks ? (r.completed / r.tasks) * 100 : 0}%"></span></div></td></tr>`).join("") || '<tr><td colspan="7">No records yet.</td></tr>'}</tbody></table></div>`;
}
function renderTeams() {
  const d = state.performance;
  const pending = state.requests.filter((r) => r.status === "PENDING");
  const cards = state.teams
    .map((t) => {
      const people = state.members.filter((m) => m.teamId === t.id);
      const candidates = isAdmin()
        ? state.members.filter(
            (m) => m.active && m.role === "EMPLOYEE" && m.teamId !== t.id,
          )
        : state.candidates;
      return `<section class="panel team-card"><div class="panel-head"><div><h2>${esc(t.name)}</h2><small>Led by ${esc(state.members.find((m) => m.id === t.leaderId)?.name || "No leader assigned")}</small></div><span class="pill">${people.length} people</span></div><div class="team-card-body">${isAdmin() ? `<button class="text-button" data-edit-team="${esc(t.id)}">Edit team / appoint leader</button>` : ""}<ul class="team-roster">${people.map((m) => `<li><div><strong>${esc(m.name)}</strong><small>${esc(roleLabel(m.role))}${m.active ? "" : " · Inactive"}</small></div>${m.role === "EMPLOYEE" ? `<button class="text-button danger" data-remove-member="${esc(m.id)}" data-team="${esc(t.id)}">Remove</button>` : '<span class="badge">Leader</span>'}</li>`).join("") || "<li>No members yet.</li>"}</ul><form data-team-add="${esc(t.id)}" class="team-add-form"><label>${isAdmin() ? "Assign employee" : "Request an employee"}<select name="employeeId" required><option value="">Choose an employee</option>${candidates.map((m) => opt(m.id, m.name + " · " + m.email)).join("")}</select></label><button class="button" ${candidates.length ? "" : "disabled"}>${isAdmin() ? "Assign employee" : "Request approval"}</button></form><small>${isAdmin() ? "Assign employee adds an existing CRM account to this team, transferring them from their current team, if any." : "An admin must approve additions. Removing a member keeps their account and work."}</small></div></section>`;
    })
    .join("");
  $("content").innerHTML =
    `<div class="settings-grid"><div class="team-toolbar"><a href="#settings" class="text-button">← Team & settings</a>${isAdmin() ? '<button class="button primary" data-new="teams">+ Create team</button>' : ""}</div><div class="team-grid">${cards || '<section class="panel empty">No teams yet. ' + (isAdmin() ? "Create a team and appoint a sub-admin to lead it." : "Ask your admin to assign you as a team leader.") + "</section>"}</div><section class="panel"><div class="panel-head"><div><h2>Employee requests</h2><small>${isAdmin() ? "Review additions before employees move into a team." : "Follow the status of requests for your team."}</small></div><span class="pill">${pending.length} pending</span></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Requested team</th><th>Requested by</th><th>Status</th><th>Review</th></tr></thead><tbody>${state.requests.map((r) => `<tr><td>${esc(r.employeeName)}</td><td>${esc(r.team.name)}</td><td>${esc(r.requesterName)}<small>${dateLabel(r.createdAt)}</small></td><td><span class="badge">${esc(r.status)}</span></td><td>${isAdmin() && r.status === "PENDING" ? `<button class="text-button" data-request="${esc(r.id)}" data-decision="APPROVED">Approve</button><button class="text-button danger" data-request="${esc(r.id)}" data-decision="REJECTED">Reject</button>` : "—"}</td></tr>`).join("") || '<tr><td colspan="5">No employee requests yet.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><div><h2>Team performance</h2><small>All time · based on current team membership and record assignments.</small></div></div>${performanceTable(d.teams, true)}</section><section class="panel"><div class="panel-head"><div><h2>Employee performance</h2><small>Includes leaders, admins and unassigned employees in your permitted view. Deals follow the contact owner; tasks follow their assignee.</small></div></div>${performanceTable(d.employees)}</section></div>`;
}
async function loadView() {
  const version = ++state.version;
  $("refresh").disabled = true;
  $("syncStatus").textContent = "Syncing with server…";
  try {
    const user = await api("/me");
    if (version !== state.version) return;
    const accessChanged =
      state.user &&
      (state.user.role !== user.role || state.user.teamId !== user.teamId);
    state.user = user;
    renderIdentity();
    if (accessChanged) {
      $("editor").close();
      editing = null;
      [state.members, state.stages] = await Promise.all([
        api("/members"),
        api("/stages"),
      ]);
      if (version !== state.version) return;
      notice(
        "Your access was updated. The workspace now reflects your current role and team.",
      );
      navigate();
      return;
    }
    if (state.view === "overview") {
      const data = await api("/dashboard?today=" + today());
      if (version !== state.version) return;
      renderDashboard(data);
    } else if (state.view === "documents") {
      const data = await api("/documents?page=" + state.page);
      if (version !== state.version) return;
      renderDocuments(data);
    } else if (state.view === "attendance") {
      await loadAttendance(version);
      if (version !== state.version) return;
    } else if (state.view === "profile") {
      renderProfile();
    } else if (state.view === "teams") {
      const [teams, members, requests, candidates, performance] =
        await Promise.all([
          api("/teams"),
          api("/members"),
          api("/team-requests"),
          api("/team-candidates"),
          api("/performance"),
        ]);
      if (version !== state.version) return;
      Object.assign(state, {
        teams,
        members,
        requests,
        candidates,
        performance,
      });
      renderTeams();
    } else if (["activity", "recycle-bin"].includes(state.view)) {
      const params = new URLSearchParams({
        ...state.filters,
        page: state.page,
      });
      const data = await api("/" + state.view + "?" + params);
      if (version !== state.version) return;
      renderHistory(data);
    } else if (state.view === "settings") {
      if (!isManager()) throw new Error("Team management permission required.");
      const [members, stages, teams] = await Promise.all([
        api("/members"),
        api("/stages"),
        api("/teams"),
      ]);
      state.teams = teams;
      state.attendancePolicy = isAdmin()
        ? await api("/attendance/settings")
        : null;
      if (version !== state.version) return;
      state.members = members;
      state.stages = stages;
      renderSettings();
    } else {
      const params = new URLSearchParams({
        ...state.filters,
        page: state.page,
      });
      const data = await api("/" + state.view + "?" + params);
      if (version !== state.version) return;
      renderList(state.view, data);
    }
    $("syncStatus").textContent =
      "Updated " +
      new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
  } catch (err) {
    if (version !== state.version) return;
    notice(err.message, true);
    $("syncStatus").textContent = "Not synced — refresh to retry";
    $("content").innerHTML =
      '<div class="panel empty">We couldn’t load this view. Your saved data has not been changed.<br><button class="button" id="retryView">Retry</button></div>';
    $("retryView").onclick = loadView;
  } finally {
    if (version === state.version) $("refresh").disabled = false;
  }
}
function navigate() {
  const view = location.hash.slice(1) || "overview";
  state.view = [
    "overview",
    "attendance",
    "contacts",
    "deals",
    "tasks",
    "documents",
    "profile",
    ...(isManager() ? ["settings", "teams", "recycle-bin"] : []),
    ...(isAdmin() ? ["activity"] : []),
  ].includes(view)
    ? view
    : "overview";
  state.filters = {};
  state.page = 1;
  $("sidebar").classList.remove("open");
  $("menu").setAttribute("aria-expanded", "false");
  document.querySelectorAll("[data-view]").forEach((a) => {
    a.classList.toggle(
      "active",
      a.dataset.view === state.view ||
        (["teams", "activity", "recycle-bin"].includes(state.view) &&
          a.dataset.view === "settings"),
    );
    if (
      a.dataset.view === state.view ||
      (["teams", "activity", "recycle-bin"].includes(state.view) &&
        a.dataset.view === "settings")
    )
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const labels = {
    overview: "Overview",
    contacts: "Contacts",
    deals: "Deals",
    tasks: "Tasks",
    documents: "Document centre",
    attendance: "Attendance",
    settings: "Team & settings",
    profile: "Your profile",
    teams: "Teams & performance",
    activity: "Activity history",
    "recycle-bin": "Recycle bin",
  };
  $("crumb").textContent = labels[state.view];
  document.title = labels[state.view] + " — Virtual Binz";
  $("pageTitle").textContent =
    state.view === "overview"
      ? "Hello, " + state.user.name.split(" ")[0] + "."
      : labels[state.view];
  $("subtitle").textContent = {
    overview: "Here’s where things stand. Let’s keep them moving.",
    contacts: "Good relationships start with knowing your people.",
    deals: "Every conversation is an opportunity to move forward.",
    tasks: "A clear next step for every relationship.",
    documents: "Upload, organise and download your documents.",
    attendance: "Your workday, breaks and attendance records in one place.",
    settings: "Keep your workspace organised and your team in control.",
    profile: "Your account, your team, and your access in one place.",
    teams: "A clear view of your people and their progress.",
    activity: "Who changed what, and when. History starts with this update.",
    "recycle-bin":
      "Recover deleted work. Restore linked contacts before deals, and deals before tasks.",
  }[state.view];
  $("eyebrow").textContent =
    state.view === "overview"
      ? "YOUR WORKSPACE AT A GLANCE"
      : "YOUR SHARED WORKSPACE";
  $("add").hidden = [
    "documents",
    "attendance",
    "settings",
    "profile",
    "teams",
    "activity",
    "recycle-bin",
  ].includes(state.view);
  $("add").textContent = {
    overview: "+ New deal",
    contacts: "+ Add contact",
    deals: "+ New deal",
    tasks: "+ Add task",
  }[state.view];
  $("content").innerHTML = '<div class="empty panel">Loading…</div>';
  loadView();
}
$("refresh").onclick = async () => {
  $("notice").hidden = true;
  try {
    [state.stages, state.members] = await Promise.all([
      api("/stages"),
      api("/members"),
    ]);
    await loadView();
  } catch (e) {
    notice(e.message, true);
  }
};
$("add").onclick = () =>
  openEditor(state.view === "overview" ? "deals" : state.view);
const field = (name, label, value = "", type = "text", extra = "") =>
  "<label>" +
  label +
  '<input name="' +
  name +
  '" type="' +
  type +
  '" value="' +
  esc(value) +
  '" ' +
  extra +
  "></label>";
const select = (name, label, options, extra = "") =>
  "<label>" +
  label +
  '<select name="' +
  name +
  '" ' +
  extra +
  ">" +
  options +
  "</select></label>";
let editing = null;
async function allChoices(type) {
  // Grab all pages so the dropdowns don’t miss anyone.
  let page = 1,
    all = [];
  while (true) {
    const data = await api(
      "/" +
        type +
        "?page=" +
        page +
        "&sort=" +
        (type === "contacts" ? "name" : "title") +
        "&direction=asc",
    );
    all.push(...data.items);
    if (page * data.pageSize >= data.total) return all;
    page++;
  }
}
let openingEditor = false;
async function openEditor(type, record) {
  if (openingEditor) return;
  openingEditor = true;
  try {
    const item = record || {};
    let html = "";
    if (type === "contacts") {
      html =
        field(
          "name",
          "Full name",
          item.name,
          "text",
          'required maxlength="120"',
        ) +
        field("email", "Email", item.email, "email", 'maxlength="254"') +
        field("phone", "Phone", item.phone, "tel", 'maxlength="30"') +
        field(
          "company",
          "Organisation / company",
          item.company,
          "text",
          'maxlength="120"',
        ) +
        select(
          "assigneeId",
          "Assigned to",
          opt("", isAdmin() ? "Unassigned" : "Myself", item.assigneeId) +
            state.members
              .filter((m) => m.active || m.id === item.assigneeId)
              .map((m) => opt(m.id, m.name, item.assigneeId))
              .join(""),
          isManager() ? "" : "disabled",
        );
    } else if (type === "deals") {
      const contacts = await allChoices("contacts");
      if (!contacts.length) {
        notice("Add a contact first — every deal must belong to someone.");
        return;
      }
      if (!state.stages.length) {
        notice("Ask an administrator to add a pipeline stage.");
        return;
      }
      html =
        field(
          "title",
          "Deal title",
          item.title,
          "text",
          'required maxlength="160"',
        ) +
        select(
          "contactId",
          "Contact",
          contacts.map((c) => opt(c.id, c.name, item.contactId)).join(""),
          "required",
        ) +
        select(
          "stageId",
          "Stage",
          state.stages.map((s) => opt(s.id, s.name, item.stageId)).join(""),
          "required",
        ) +
        field(
          "value",
          "Value (₹)",
          item.value ?? "0",
          "number",
          'required min="0" max="999999999999.99" step="0.01"',
        ) +
        field(
          "expectedCloseDate",
          "Expected close date",
          item.expectedCloseDate?.slice(0, 10),
          "date",
        );
    } else if (type === "tasks") {
      const [contacts, deals] = await Promise.all([
        allChoices("contacts"),
        allChoices("deals"),
      ]);
      html =
        field(
          "title",
          "Task title",
          item.title,
          "text",
          'required maxlength="160"',
        ) +
        field("dueDate", "Due date", item.dueDate?.slice(0, 10), "date") +
        select(
          "link",
          "Linked record",
          opt("", "No linked record", "") +
            contacts
              .map((c) =>
                opt(
                  "contact:" + c.id,
                  "Contact · " + c.name,
                  item.contactId ? "contact:" + item.contactId : "",
                ),
              )
              .join("") +
            deals
              .map((d) =>
                opt(
                  "deal:" + d.id,
                  "Deal · " + d.title,
                  item.dealId ? "deal:" + item.dealId : "",
                ),
              )
              .join(""),
        ) +
        select(
          "completed",
          "Status",
          opt("false", "Pending", String(item.completed || false)) +
            opt("true", "Complete", String(item.completed || false)),
        );
    } else if (type === "teams") {
      html =
        field(
          "name",
          "Team name",
          item.name,
          "text",
          'required maxlength="80"',
        ) +
        select(
          "leaderId",
          "Team leader (sub-admin)",
          opt("", "Choose a leader") +
            state.members
              .filter(
                (m) =>
                  m.active &&
                  m.role !== "ADMIN" &&
                  (!m.teamId || m.teamId === item.id),
              )
              .map((m) => opt(m.id, m.name, item.leaderId))
              .join(""),
          "required",
        ) +
        "<small>The selected person becomes the sub-admin for this team. Replacing a leader returns the previous leader to the employee role.</small>";
    } else if (type === "stages") {
      html =
        field(
          "name",
          "Stage name",
          item.name,
          "text",
          'required maxlength="60"',
        ) +
        select(
          "kind",
          "Outcome type",
          ["OPEN", "WON", "LOST"]
            .map((k) => opt(k, k, item.kind || "OPEN"))
            .join(""),
          item.id ? "disabled" : "",
        ) +
        field(
          "position",
          "Display position",
          item.position ?? state.stages.length,
          "number",
          'min="0" max="999" required step="1"',
        ) +
        "<small>Open stages count toward pipeline value. Won stages count toward monthly wins. A stage in use cannot be deleted.</small>";
    } else if (type === "member-passwords") {
      html =
        `<p>Set a new password for <strong>${esc(item.name)}</strong> (${esc(item.email)}). This signs out their existing sessions. Their role and active/inactive status stay the same.</p>` +
        field(
          "password",
          "New password (12+ characters)",
          "",
          "password",
          'required minlength="12" autocomplete="new-password"',
        ) +
        "<small>Share the new password privately. The member can change it from their profile after signing in.</small>";
    } else if (type === "members") {
      html =
        field("name", "Full name", "", "text", 'required maxlength="20"') +
        field("email", "Email", "", "email", "required") +
        field(
          "phone",
          "Phone (10 digits)",
          "",
          "tel",
          'required pattern="[0-9]{10}"',
        ) +
        field(
          "password",
          "Initial password (12+ characters)",
          "",
          "password",
          'required minlength="12" autocomplete="new-password"',
        ) +
        select(
          "role",
          "Role",
          opt("EMPLOYEE", "Employee", "EMPLOYEE") +
            opt("SUB_ADMIN", "Sub-admin") +
            opt("ADMIN", "Admin"),
        ) +
        "<small>Share the initial password privately with this team member. They can change it from their profile. Assign sub-admins as leaders on the Teams & performance page.</small>";
    }
    if (type === "tasks" && isManager())
      html += select(
        "assigneeId",
        "Assigned to",
        state.members
          .filter((m) => m.active)
          .map((m) => opt(m.id, m.name, item.assigneeId || state.user.id))
          .join(""),
        "required",
      );
    editing = { type, item };
    $("editorTitle").textContent =
      type === "members" && !item.id
        ? "Create employee"
        : (item.id ? "Edit " : "New ") +
          {
            contacts: "contact",
            deals: "deal",
            tasks: "task",
            stages: "stage",
            members: "team member",
            "member-passwords": "member password",
            teams: "team",
          }[type];
    $("fields").innerHTML = html;
    window.addPasswordToggles($("fields"));
    $("formError").hidden = true;
    $("save").disabled = false;
    $("editor").showModal();
  } catch (e) {
    notice(e.message, true);
  } finally {
    openingEditor = false;
  }
}
$("closeEditor").onclick = $("cancelEditor").onclick = () =>
  $("editor").close();
$("editor").addEventListener("close", () => {
  $("fields").replaceChildren();
  editing = null;
});
$("editorForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!editing) return;
  const { type, item } = editing,
    body = Object.fromEntries(new FormData(e.target));
  if (type === "contacts" && !isManager())
    body.assigneeId = item.assigneeId || state.user.id;
  if (type === "tasks") {
    const [kind, id] = (body.link || "").split(":");
    body.contactId = kind === "contact" ? id : null;
    body.dealId = kind === "deal" ? id : null;
    body.completed = body.completed === "true";
    delete body.link;
  }
  $("save").disabled = true;
  $("formError").hidden = true;
  try {
    await api(
      "/" + type + (item.id ? "/" + item.id : ""),
      item.id ? "PATCH" : "POST",
      body,
    );
    $("editor").close();
    $("fields").replaceChildren();
    editing = null;
    notice(
      type === "members"
        ? "Account created. Share the email and initial password privately. Role changes keep the same password."
        : type === "member-passwords"
          ? "Password reset. Share the new password privately. Account activation and role are unchanged."
          : "Saved successfully.",
    );
    if (type === "stages") state.stages = await api("/stages");
    if (type === "members") state.members = await api("/members");
    await loadView();
  } catch (err) {
    $("formError").textContent = err.message;
    $("formError").hidden = false;
  } finally {
    $("save").disabled = false;
  }
};
$("content").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.resetPassword)
      return openEditor(
        "member-passwords",
        state.members.find((m) => m.id === b.dataset.resetPassword),
      );
    if (b.dataset.switchAccount) return logout();
    if (b.dataset.new) return openEditor(b.dataset.new);
    if (b.dataset.editTeam)
      return openEditor(
        "teams",
        state.teams.find((t) => t.id === b.dataset.editTeam),
      );
    if (b.dataset.removeMember) {
      if (
        !confirm(
          "Remove this employee from the team? Their account and assigned work will be kept.",
        )
      )
        return;
      b.disabled = true;
      await api(
        "/teams/" + b.dataset.team + "/members/" + b.dataset.removeMember,
        "DELETE",
      );
      notice("Employee removed from the team.");
      return loadView();
    }
    if (b.dataset.request) {
      if (
        !confirm(
          b.dataset.decision === "APPROVED"
            ? "Approve this employee's move into the requested team?"
            : "Reject this request?",
        )
      )
        return;
      b.disabled = true;
      await api("/team-requests/" + b.dataset.request, "PATCH", {
        status: b.dataset.decision,
      });
      notice("Request reviewed.");
      return loadView();
    }
    if (b.dataset.edit) {
      const item =
        b.dataset.edit === "stages"
          ? state.stages.find((s) => s.id === b.dataset.id)
          : await api("/" + b.dataset.edit + "/" + b.dataset.id);
      return openEditor(b.dataset.edit, item);
    }
    if (b.dataset.restore) {
      b.disabled = true;
      await api(
        "/recycle-bin/" + b.dataset.type + "/" + b.dataset.restore + "/restore",
        "POST",
      );
      notice(
        "Record restored. Review its assignment if team membership has changed.",
      );
      return loadView();
    }
    if (b.dataset.delete) {
      if (
        !confirm(
          b.dataset.delete === "stages"
            ? "Permanently delete this unused pipeline stage? Stages are not kept in the recycle bin."
            : "Move this record to the recycle bin? It will disappear from normal views and reports. You can restore it later. Move linked records to the bin or unlink them first.",
        )
      )
        return;
      b.disabled = true;
      await api("/" + b.dataset.delete + "/" + b.dataset.id, "DELETE");
      notice(
        b.dataset.delete === "stages"
          ? "Pipeline stage deleted."
          : "Record moved to the recycle bin.",
      );
      if (b.dataset.delete === "stages") state.stages = await api("/stages");
      await loadView();
    }
    if (b.dataset.role || b.dataset.active) {
      const m = state.members.find(
        (m) => m.id === (b.dataset.role || b.dataset.active),
      );
      if (!confirm("Change access for " + m.name + "?")) return;
      b.disabled = true;
      await api(
        "/members/" + m.id,
        "PATCH",
        b.dataset.role
          ? { role: m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN" }
          : { active: !m.active },
      );
      notice("Team access updated.");
      await loadView();
    }
  } catch (err) {
    notice(err.message, true);
    b.disabled = false;
  }
});
$("content").addEventListener("change", async (e) => {
  const el = e.target;
  if (el.dataset.memberRole) {
    const m = state.members.find((m) => m.id === el.dataset.memberRole);
    if (
      !confirm(
        "Change " +
          m.name +
          " to " +
          roleLabel(el.value) +
          "? Changing a team leader's role removes their leadership.",
      )
    ) {
      el.value = m.role;
      return;
    }
    el.disabled = true;
    try {
      await api("/members/" + m.id, "PATCH", { role: el.value });
      notice("Role updated.");
      await loadView();
    } catch (err) {
      notice(err.message, true);
      el.value = m.role;
      el.disabled = false;
    }
    return;
  }
  if (!el.dataset.complete && !el.dataset.stage) return;
  el.disabled = true;
  try {
    if (el.dataset.complete)
      await api("/tasks/" + el.dataset.complete, "PATCH", {
        completed: el.checked,
      });
    else
      await api("/deals/" + el.dataset.stage, "PATCH", { stageId: el.value });
    notice("Saved successfully.");
    await loadView();
  } catch (err) {
    if (el.dataset.complete) el.checked = !el.checked;
    else
      el.value =
        state.items.find((d) => d.id === el.dataset.stage)?.stageId || "";
    notice(err.message, true);
    el.disabled = false;
  }
});
$("content").addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-team-add]");
  if (!form) return;
  e.preventDefault();
  const button = form.querySelector("button");
  if (
    isAdmin() &&
    !confirm(
      "Assign this employee to this team? This replaces their current team assignment.",
    )
  )
    return;
  button.disabled = true;
  try {
    await api(
      "/teams/" + form.dataset.teamAdd + (isAdmin() ? "/members" : "/requests"),
      "POST",
      Object.fromEntries(new FormData(form)),
    );
    notice(
      isAdmin()
        ? "Employee assigned to team."
        : "Request sent to your admin for approval.",
    );
    await loadView();
  } catch (err) {
    notice(err.message, true);
    button.disabled = false;
  }
});
let searchTimer,
  searchVersion = 0;
$("globalSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const version = ++searchVersion,
    q = $("globalSearch").value.trim();
  if (q.length < 2) {
    $("searchResults").hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    $("searchResults").hidden = false;
    $("searchResults").textContent = "Searching…";
    try {
      const data = await api("/search?q=" + encodeURIComponent(q));
      if (version !== searchVersion) return;
      $("searchResults").innerHTML =
        Object.entries(data)
          .filter(([, items]) => items.length)
          .map(
            ([type, items]) =>
              "<h3>" +
              esc(type.toUpperCase()) +
              " · up to 10 matches</h3>" +
              items
                .map(
                  (item) =>
                    '<button data-search-type="' +
                    type +
                    '" data-id="' +
                    esc(item.id) +
                    '">' +
                    esc(item.name || item.title) +
                    "</button>",
                )
                .join(""),
          )
          .join("") || '<p class="empty">No matching records.</p>';
    } catch (err) {
      if (version === searchVersion)
        $("searchResults").textContent = err.message;
    }
  }, 250);
});
$("searchResults").onclick = async (e) => {
  const b = e.target.closest("[data-search-type]");
  if (!b) return;
  $("searchResults").hidden = true;
  try {
    await openEditor(
      b.dataset.searchType,
      await api("/" + b.dataset.searchType + "/" + b.dataset.id),
    );
  } catch (err) {
    notice(err.message, true);
  }
};
function renderIdentity() {
  $("userName").textContent = state.user.name;
  $("userRole").textContent = roleLabel(state.user.role);
  $("workspaceName").textContent = state.user.orgId;
  const initials = state.user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  $("avatar").textContent = $("headerAvatar").textContent = initials;
  $("settingsNav").hidden = !isManager();
}
async function init() {
  try {
    [state.user, state.stages, state.members] = await Promise.all([
      api("/me"),
      api("/stages"),
      api("/members"),
    ]);
    renderIdentity();
    window.addEventListener("hashchange", navigate);
    navigate();
  } catch (err) {
    notice(err.message, true);
    $("content").innerHTML =
      '<div class="panel empty">Could not open your workspace. <button class="button" id="retryInit">Retry</button></div>';
    $("retryInit").onclick = init;
  }
}
init();
