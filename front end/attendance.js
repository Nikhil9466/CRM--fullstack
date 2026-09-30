/* Attendance shares the dashboard's API/session, navigation and design system. */
let attendanceTab = "mine",
  attendanceBusy = false,
  attendanceToday = null,
  attendanceHistory = [],
  attendanceFilters = {},
  attendanceRequestPage = 1;
const attDuration = (seconds) => {
  const m = Math.floor(Math.max(0, seconds || 0) / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
const attTime = (value) =>
  value
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const attBadge = (value) => `<span class="badge">${esc(value)}</span>`;
const attLocalInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const attInputUTC = (value, originalUTC = "") => {
  // Keep unchanged server timestamps exact, including seconds, milliseconds and
  // the UTC offset in an ambiguous daylight-saving hour.
  if (originalUTC && value === attLocalInput(originalUTC)) return originalUTC;
  if (!value)
    throw Error("Complete all requested check-in, checkout and break times.");
  const d = new Date(value);
  if (!Number.isFinite(+d)) throw Error("Enter a valid date and time.");
  return d.toISOString();
};
function attendanceSettingsPanel() {
  const p = state.attendancePolicy;
  if (!isAdmin() || !p) return "";
  return `<section class="panel attendance-panel"><div class="panel-head"><div><h2>Attendance Settings</h2><small>Workspace policy. Existing attendance keeps the policy captured at check-in. Missing dates use the current policy.</small></div></div><form id="attendanceSettings" class="attendance-form"><fieldset><legend>Working days</legend><div class="attendance-days">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => `<label><input type="checkbox" name="workingDays" value="${i}" ${p.workingDays.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div></fieldset><div class="attendance-form-grid"><label>Workspace timezone<input name="timeZone" value="${esc(p.timeZone)}" placeholder="Asia/Kolkata" required maxlength="80"><small>IANA name, such as Asia/Kolkata or UTC. Determines workdays and lateness.</small></label><label>Work start<input type="time" name="startTime" value="${esc(p.startTime)}" required></label><label>Work end<input type="time" name="endTime" value="${esc(p.endTime)}" required></label><label>Late grace period (minutes)<input type="number" name="graceMinutes" min="0" max="180" value="${p.graceMinutes}" required></label><label>Expected working hours<input type="number" name="expectedHours" min="0.0166667" max="24" step="any" value="${p.expectedMinutes / 60}" required></label></div><p class="attendance-note">Off days appear as Holiday. Overnight schedules are not supported. Changes apply to new check-ins and unrecorded dates.</p><button class="button primary">Save attendance settings</button><span role="status" class="attendance-feedback"></span></form></section>`;
}
function attResumeButton(r, name = state.user.name) {
  return isAdmin() && r.canResume && r.employee?.active !== false
    ? `<button class="button" data-att-resume="${esc(r.id)}" data-att-version="${r.version}" data-att-name="${esc(name)}">Resume work</button>`
    : "";
}
function attTodayCard(data) {
  const r = data.open || data.today,
    p = r.policy,
    stale = r.needsCorrection;
  const buttons = r.actionsExpired
    ? `<button class="button primary" data-att-correct="${esc(r.workDate)}">Request correction</button>`
    : r.checkOut
      ? attResumeButton(r)
      : r.checkIn
        ? r.status === "On Break"
          ? '<button class="button primary" data-att-action="end-break">End Break</button>'
          : '<button class="button" data-att-action="start-break">Start Break</button><button class="button primary" data-att-action="check-out">Check Out</button>'
        : r.status === "Holiday"
          ? ""
          : '<button class="button primary" data-att-action="check-in">Check In</button>';
  return `<section class="panel attendance-panel" id="attToday"><div class="panel-head"><div><p class="eyebrow">${stale ? "OPEN WORKDAY" : "TODAY’S ATTENDANCE"} · ${esc(r.workDate)}</p><h2>${esc(r.status)}</h2><small>${esc(p.startTime)}–${esc(p.endTime)} · ${esc(p.timeZone)} · ${attDuration(p.expectedMinutes * 60)} expected</small></div>${r.checkIn ? attBadge(r.attendanceStatus) : ""}</div><div class="attendance-body"><div class="attendance-metrics"><div><small>Worked</small><strong data-att-live="worked">${attDuration(r.workedSeconds)}</strong></div><div><small>Breaks</small><strong data-att-live="break">${attDuration(r.breakSeconds)}</strong></div><div><small>Check in</small><strong>${attTime(r.checkIn)}</strong></div><div><small>Check out</small><strong>${attTime(r.checkOut)}</strong></div></div>${r.status === "On Break" ? `<p class="attendance-note">Break started ${attTime(r.breaks.find((b) => !b.end)?.start)}. Break time is excluded from worked hours.</p>` : ""}${r.actionsExpired ? '<p class="notice">This workday is over 24 hours old. Request a correction to close it before checking in again.</p>' : stale ? '<p class="notice">A previous workday is still open. Finish it within 24 hours of check-in, or request a correction. New check-in is blocked until it is closed.</p>' : ""}${r.status === "Holiday" ? '<p class="attendance-note">Non-working day. If you worked with approval, submit a correction for review.</p>' : ""}${r.checkOut && r.workedSeconds < p.expectedMinutes * 60 ? `<p class="attendance-note">${attDuration(p.expectedMinutes * 60 - r.workedSeconds)} below expected working hours.</p>` : ""}<div class="attendance-actions">${buttons}</div><small>Times shown in your browser timezone. Totals are calculated by the server and refreshed every 30 seconds.</small></div></section>`;
}
function attRows(rows, report = false) {
  return (
    rows
      .map(
        (r) =>
          `<tr>${report ? `<td><strong>${esc(r.employee.name)}</strong>${!r.employee.active ? "<small>Inactive</small>" : ""}</td><td>${esc(r.employee.team?.name || "Unassigned")}</td>` : `<td>${esc(r.workDate)}</td>`}<td>${attTime(r.checkIn)}</td><td>${attTime(r.checkOut)}</td><td>${attDuration(r.breakSeconds)}</td><td>${attDuration(r.workedSeconds)}</td><td>${attBadge(r.status)}${r.checkIn ? `<small>${esc(r.attendanceStatus)}${r.needsCorrection ? " · Needs correction" : ""}</small>` : ""}</td>${report ? (isAdmin() ? `<td>${attResumeButton(r, r.employee.name)}</td>` : "") : `<td>${r.status === "Not employed" ? "" : `<button class="text-button" data-att-correct="${esc(r.workDate)}">Request correction</button>`}</td>`}</tr>`,
      )
      .join("") ||
    '<tr><td colspan="8" class="empty">No attendance matches these filters.</td></tr>'
  );
}
function attCorrectionForm() {
  return `<section class="panel attendance-panel"><div class="panel-head"><div><h2>Request an attendance correction</h2><small>Propose a complete work period and all breaks. An admin must approve it; official attendance stays unchanged until then.</small></div></div><form id="attendanceCorrection" class="attendance-form"><div class="attendance-form-grid"><label>Workday (workspace timezone)<input type="date" name="workDate" required></label><label>Requested check-in<input type="datetime-local" name="checkIn" required></label><label>Requested checkout<input type="datetime-local" name="checkOut" required></label></div><p class="attendance-note">Enter times in your browser timezone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Include every break to keep worked hours accurate.</p><div id="attBreakInputs"></div><button class="text-button" type="button" data-att-add-break>Add break period</button><label>Reason<textarea name="reason" required maxlength="1000" rows="3" placeholder="Explain the missing or incorrect attendance"></textarea></label><button class="button primary">Submit correction request</button><span role="status" class="attendance-feedback"></span></form></section>`;
}
function attRequests(data, review = false) {
  return `<section class="panel attendance-panel"><div class="panel-head"><div><h2>${review ? "Correction review" : "My correction requests"}</h2><small>${review ? "Review the full proposed period. Admins may also approve their own requests." : "Pending requests do not change official attendance."}</small></div></div><div class="table-wrap"><table><thead><tr>${review ? "<th>Employee</th>" : ""}<th>Workday</th><th>Requested period</th><th>Reason</th><th>Status / review</th>${review ? "<th>Decision</th>" : ""}</tr></thead><tbody>${data.items.map((r) => `<tr>${review ? `<td>${esc(r.user.name)}</td>` : ""}<td>${esc(r.workDate.slice(0, 10))}</td><td>${attTime(r.proposed.checkIn)}<br>${attTime(r.proposed.checkOut)}<details><summary>${r.proposed.breaks.length} break(s)</summary>${r.proposed.breaks.map((b) => `<div>${attTime(b.start)} → ${attTime(b.end)}</div>`).join("") || "No breaks"}</details></td><td class="attendance-reason">${esc(r.reason)}</td><td>${attBadge(r.status)}<small>${esc(r.reviewer?.name || "")}${r.reviewNote ? " · " + esc(r.reviewNote) : ""}</small></td>${review ? `<td>${r.status === "PENDING" ? `<form data-att-review="${esc(r.id)}"><label for="note-${esc(r.id)}">Review note</label><input id="note-${esc(r.id)}" name="reviewNote" maxlength="1000" placeholder="Review note (optional)"><div class="attendance-actions"><button class="button" name="status" value="APPROVED">Approve</button><button class="button" name="status" value="REJECTED">Reject</button></div><span role="status" class="attendance-feedback"></span></form>` : "—"}</td>` : ""}</tr>`).join("") || `<tr><td colspan="6" class="empty">No correction requests.</td></tr>`}</tbody></table></div><div class="pager"><span>${data.total} requests · Page ${data.page}</span><div><button class="button" data-att-request-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button><button class="button" data-att-request-page="${data.page + 1}" ${data.page * data.pageSize >= data.total ? "disabled" : ""}>Next</button></div></div></section>`;
}
async function loadAttendance(version) {
  if (
    (attendanceTab === "review" && !isAdmin()) ||
    (attendanceTab === "team" && !isManager())
  )
    attendanceTab = "mine";
  let body = "";
  if (attendanceTab === "mine") {
    const query = new URLSearchParams(attendanceFilters.mine || {});
    const [data, history, requests] = await Promise.all([
      api("/attendance/today"),
      api("/attendance/history?" + query),
      api("/attendance/corrections?page=" + attendanceRequestPage),
    ]);
    if (version !== state.version) return;
    attendanceToday = { ...data, receivedAt: Date.now() };
    attendanceHistory = history.items;
    body =
      attTodayCard(data) +
      `<section class="panel"><div class="panel-head"><div><h2>My attendance history</h2><small>Up to 93 days. Holiday means a non-working day; absence is counted after the scheduled work end.</small></div></div><form id="attendanceHistoryFilters" class="filters"><label>From<input type="date" name="from" max="${esc(data.today.workDate)}" value="${esc(attendanceFilters.mine?.from || history.items.at(-1)?.workDate || "")}" required></label><label>To<input type="date" name="to" max="${esc(data.today.workDate)}" value="${esc(attendanceFilters.mine?.to || data.today.workDate)}" required></label><button class="button">Apply dates</button></form><div class="table-wrap"><table><thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Breaks</th><th>Worked</th><th>Status</th><th>Correction</th></tr></thead><tbody>${attRows(history.items)}</tbody></table></div></section>` +
      attCorrectionForm() +
      attRequests(requests);
  } else if (attendanceTab === "team") {
    const query = new URLSearchParams(attendanceFilters.team || {});
    const [data, members, teams] = await Promise.all([
      api("/attendance/report?" + query),
      api("/members"),
      api("/teams"),
    ]);
    if (version !== state.version) return;
    const f = attendanceFilters.team || {};
    body = `<div class="attendance-summary">${["Present", "Late", "Absent", "Working", "On Break", "Checked Out"].map((s) => `<div class="panel attendance-stat"><small>${s}</small><strong>${data.summary[s]}</strong></div>`).join("")}</div><section class="panel"><div class="panel-head"><div><h2>${isAdmin() ? "Organisation attendance" : "My team’s attendance"}</h2><small>Current team membership · Present/Late describe arrival; Working/On Break/Checked Out describe work state. Counts can overlap.</small></div></div><form id="attendanceReportFilters" class="filters"><label>Date<input type="date" name="date" max="${esc(data.today)}" value="${esc(f.date || data.date)}" required></label><label>Team<select name="teamId">${opt("", "All permitted teams", f.teamId)}${teams.map((t) => opt(t.id, t.name, f.teamId)).join("")}</select></label><label>Employee<select name="employeeId">${opt("", "All permitted employees", f.employeeId)}${members.map((m) => opt(m.id, m.name, f.employeeId)).join("")}</select></label><label>Status<select name="status">${opt("", "All statuses", f.status)}${Object.keys(
      data.summary,
    )
      .map((s) => opt(s, s, f.status))
      .join(
        "",
      )}</select></label><button class="button">Apply filters</button></form><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Team</th><th>Check in</th><th>Check out</th><th>Breaks</th><th>Worked</th><th>Status</th>${isAdmin() ? "<th>Actions</th>" : ""}</tr></thead><tbody>${attRows(data.items, true)}</tbody></table></div><div class="pager"><span>${data.total} employees · Page ${data.page}</span><div><button class="button" data-att-report-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button><button class="button" data-att-report-page="${data.page + 1}" ${data.page * 50 >= data.total ? "disabled" : ""}>Next</button></div></div></section>`;
  } else {
    const data = await api(
      "/attendance/corrections?view=review&page=" + attendanceRequestPage,
    );
    if (version !== state.version) return;
    body = attRequests(data, true);
  }
  $("content").innerHTML =
    `<div class="settings-grid"><nav class="attendance-tabs" aria-label="Attendance views">${[["mine", "My attendance"], ...(isManager() ? [["team", isAdmin() ? "Organisation attendance" : "My team"]] : []), ...(isAdmin() ? [["review", "Correction review"]] : [])].map(([id, name]) => `<button class="button ${attendanceTab === id ? "primary" : ""}" data-att-tab="${id}" aria-pressed="${attendanceTab === id}">${name}</button>`).join("")}</nav>${body}</div>`;
}
function attBreakRow(start = "", end = "") {
  return `<div class="attendance-break-row"><label>Break start<input type="datetime-local" data-break-start value="${esc(attLocalInput(start))}" data-original-utc="${esc(start)}" required></label><label>Break end<input type="datetime-local" data-break-end value="${esc(attLocalInput(end))}" data-original-utc="${esc(end)}" required></label><button type="button" class="text-button danger" data-att-remove-break>Remove break</button></div>`;
}
$("content").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.attResume) return openAttendanceResume(b);
  if (b.dataset.attTab) {
    attendanceTab = b.dataset.attTab;
    attendanceRequestPage = 1;
    return loadView();
  }
  if (b.dataset.attRequestPage) {
    attendanceRequestPage = Number(b.dataset.attRequestPage);
    return loadView();
  }
  if (b.dataset.attReportPage) {
    attendanceFilters.team = {
      ...attendanceFilters.team,
      page: b.dataset.attReportPage,
    };
    return loadView();
  }
  if (b.hasAttribute("data-att-add-break")) {
    if ($("attBreakInputs").children.length < 20)
      $("attBreakInputs").insertAdjacentHTML("beforeend", attBreakRow());
    return;
  }
  if (b.hasAttribute("data-att-remove-break"))
    return b.closest(".attendance-break-row").remove();
  if (b.dataset.attCorrect) {
    const r =
        attendanceHistory.find((r) => r.workDate === b.dataset.attCorrect) ||
        (attendanceToday?.open?.workDate === b.dataset.attCorrect
          ? attendanceToday.open
          : null),
      f = $("attendanceCorrection");
    if (!r || !f) return;
    f.elements.workDate.value = r.workDate;
    f.elements.checkIn.dataset.originalUtc = r.checkIn || "";
    f.elements.checkOut.dataset.originalUtc = r.checkOut || "";
    f.elements.checkIn.value = attLocalInput(r.checkIn);
    f.elements.checkOut.value = attLocalInput(r.checkOut);
    $("attBreakInputs").innerHTML = r.breaks
      .map((b) => attBreakRow(b.start, b.end))
      .join("");
    f.scrollIntoView({ behavior: "smooth", block: "center" });
    f.elements.checkIn.focus();
    return;
  }
  if (!b.dataset.attAction || attendanceBusy) return;
  attendanceBusy = true;
  document
    .querySelectorAll("[data-att-action]")
    .forEach((b) => (b.disabled = true));
  try {
    await api("/attendance/" + b.dataset.attAction, "POST", {});
    await loadView();
    notice("Attendance updated.");
  } catch (err) {
    notice(err.message, true);
    await refreshAttendanceCard();
  } finally {
    attendanceBusy = false;
    document
      .querySelectorAll("[data-att-action]")
      .forEach((b) => (b.disabled = false));
  }
});
$("content").addEventListener("input", (e) => {
  // A deliberate edit should use the newly entered time, not the original instant.
  if (e.target.dataset?.originalUtc) delete e.target.dataset.originalUtc;
});
$("content").addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id === "attendanceHistoryFilters") {
    e.preventDefault();
    const dates = Object.fromEntries(new FormData(f));
    if (
      dates.from > dates.to ||
      new Date(dates.to) - new Date(dates.from) > 92 * 86400000
    ) {
      notice("Choose an ordered date range of at most 93 days.", true);
      return;
    }
    attendanceFilters.mine = dates;
    return loadView();
  }
  if (f.id === "attendanceReportFilters") {
    e.preventDefault();
    attendanceFilters.team = Object.fromEntries(new FormData(f));
    return loadView();
  }
  if (
    !["attendanceSettings", "attendanceCorrection"].includes(f.id) &&
    !f.dataset.attReview
  )
    return;
  e.preventDefault();
  if (f.dataset.busy) return;
  f.dataset.busy = "true";
  const data = Object.fromEntries(new FormData(f)),
    feedback = f.querySelector(".attendance-feedback");
  feedback.textContent = "Saving…";
  f.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    if (f.id === "attendanceSettings") {
      const p = {
        timeZone: data.timeZone,
        startTime: data.startTime,
        endTime: data.endTime,
        graceMinutes: Number(data.graceMinutes),
        expectedMinutes: Math.round(Number(data.expectedHours) * 60),
        workingDays: new FormData(f).getAll("workingDays").map(Number),
      };
      state.attendancePolicy = await api("/attendance/settings", "PUT", p);
      feedback.textContent = "Attendance settings saved.";
    } else if (f.id === "attendanceCorrection") {
      const proposed = {
        checkIn: attInputUTC(
          data.checkIn,
          f.elements.checkIn.dataset.originalUtc,
        ),
        checkOut: attInputUTC(
          data.checkOut,
          f.elements.checkOut.dataset.originalUtc,
        ),
        breaks: [...f.querySelectorAll(".attendance-break-row")].map((row) => ({
          start: attInputUTC(
            row.querySelector("[data-break-start]").value,
            row.querySelector("[data-break-start]").dataset.originalUtc,
          ),
          end: attInputUTC(
            row.querySelector("[data-break-end]").value,
            row.querySelector("[data-break-end]").dataset.originalUtc,
          ),
        })),
      };
      await api("/attendance/corrections", "POST", {
        workDate: data.workDate,
        reason: data.reason,
        proposed,
      });
      attendanceRequestPage = 1;
      await loadView();
      notice("Correction submitted for administrator review.");
    } else {
      await api("/attendance/corrections/" + f.dataset.attReview, "PATCH", {
        status: e.submitter.value,
        reviewNote: data.reviewNote,
      });
      await loadView();
      notice("Correction reviewed.");
    }
  } catch (err) {
    feedback.textContent = err.message;
  } finally {
    delete f.dataset.busy;
    f.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
});
async function refreshAttendanceCard() {
  if (state.view !== "attendance" || attendanceTab !== "mine") return;
  const version = state.version;
  try {
    const data = await api("/attendance/today");
    if (version !== state.version || !$("attToday")) return;
    attendanceToday = { ...data, receivedAt: Date.now() };
    $("attToday").outerHTML = attTodayCard(data);
  } catch (err) {
    notice("Attendance could not refresh: " + err.message, true);
  }
}
setInterval(() => {
  if (!attendanceBusy && !document.hidden) refreshAttendanceCard();
}, 30000);
setInterval(() => {
  if (
    state.view !== "attendance" ||
    attendanceTab !== "mine" ||
    !attendanceToday
  )
    return;
  const r = attendanceToday.open || attendanceToday.today;
  if (!r.checkIn || r.checkOut) return;
  const seconds = Math.floor((Date.now() - attendanceToday.receivedAt) / 1000);
  for (const [key, value] of [
    ["worked", r.workedSeconds + (r.status === "Working" ? seconds : 0)],
    ["break", r.breakSeconds + (r.status === "On Break" ? seconds : 0)],
  ]) {
    const el = document.querySelector(`[data-att-live="${key}"]`);
    if (el) el.textContent = attDuration(value);
  }
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !attendanceBusy) refreshAttendanceCard();
});

function openAttendanceResume(button) {
  if (!isAdmin()) return;
  let dialog = $("attendanceResumeDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "attendanceResumeDialog";
    dialog.setAttribute("aria-labelledby", "attendanceResumeTitle");
    document.body.append(dialog);
  }
  if (dialog.open) return;
  const recordId = button.dataset.attResume,
    version = Number(button.dataset.attVersion);
  dialog.innerHTML = `<form class="attendance-form form-fields"><h2 id="attendanceResumeTitle">Resume work</h2><p>Resume the work timer for <strong>${esc(button.dataset.attName)}</strong> after an accidental checkout.</p><p class="attendance-note">The original check-in and worked time are kept. Time between checkout and resuming is recorded as a break. Use a correction if that gap should count as worked time.</p><label>Reason<textarea name="reason" required maxlength="500" rows="3" placeholder="Explain the accidental checkout"></textarea></label><span class="attendance-feedback" role="status"></span><div class="attendance-actions"><button class="button" type="button" data-resume-cancel>Cancel</button><button class="button primary" type="submit">Resume work</button></div></form>`;
  dialog.querySelector("[data-resume-cancel]").onclick = () => dialog.close();
  const form = dialog.querySelector("form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = "true";
    const feedback = form.querySelector(".attendance-feedback");
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await api("/attendance/records/" + recordId + "/resume", "POST", {
        version,
        reason: form.elements.reason.value,
      });
      dialog.close();
      await loadView();
      notice(
        "Work timer resumed. The checked-out gap was recorded as a break.",
      );
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      delete form.dataset.busy;
      form.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  };
  dialog.showModal();
}
