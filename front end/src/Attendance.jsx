import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import "./attendance.css";

const isAdmin = (user) => user?.role === "ADMIN";
const isManager = (user) => ["ADMIN", "SUB_ADMIN"].includes(user?.role);
const duration = (seconds = 0) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};
const time = (value) =>
  value
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const localInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
// An untouched minute-resolution input must retain the server's exact instant.
// Editing a value explicitly clears original, including if it is later restored.
const timestampField = (value = "") => ({
  value: localInput(value),
  original: value || "",
});
const inputUTC = ({ value, original }) => {
  if (original && value === localInput(original)) return original;
  if (!value)
    throw Error("Complete all requested check-in, checkout and break times.");
  const date = new Date(value);
  if (!Number.isFinite(+date)) throw Error("Enter a valid date and time.");
  return date.toISOString();
};
const statusClass = (status) =>
  ["Working", "Present", "APPROVED", "Checked Out"].includes(status)
    ? "positive"
    : ["Late", "On Break", "PENDING"].includes(status)
      ? "warning"
      : ["Absent", "REJECTED"].includes(status)
        ? "negative"
        : "";
function Status({ value }) {
  return (
    <span className={`badge attendance-badge ${statusClass(value)}`}>
      {value}
    </span>
  );
}
function Pagination({ data, onPage, noun = "requests" }) {
  if (!data) return null;
  return (
    <div className="pager attendance-pager">
      <span>
        {data.total} {noun} · Page {data.page}
      </span>
      <div>
        <button
          className="button"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          Previous
        </button>
        <button
          className="button"
          disabled={data.page * (data.pageSize || 50) >= data.total}
          onClick={() => onPage(data.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
function ResumeButton({ user, record, onResume, name }) {
  return isAdmin(user) &&
    record.canResume &&
    record.employee?.active !== false ? (
    <button
      className="text-button"
      onClick={() => onResume({ ...record, resumeName: name || user.name })}
    >
      Resume work
    </button>
  ) : null;
}
function TodayCard({ data, user, busy, onAction, onCorrect, onResume, now }) {
  if (!data) return null;
  const record = data.open || data.today;
  const policy = record.policy;
  const elapsed = Math.max(0, Math.floor((now - data.receivedAt) / 1000));
  const worked =
    record.workedSeconds +
    (!record.checkOut && record.status === "Working" ? elapsed : 0);
  const breaks =
    record.breakSeconds +
    (!record.checkOut && record.status === "On Break" ? elapsed : 0);
  let actions;
  if (record.actionsExpired)
    actions = (
      <button className="button primary" onClick={() => onCorrect(record)}>
        Request correction
      </button>
    );
  else if (record.checkOut)
    actions = <ResumeButton user={user} record={record} onResume={onResume} />;
  else if (record.checkIn)
    actions =
      record.status === "On Break" ? (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onAction("end-break")}
        >
          End break
        </button>
      ) : (
        <>
          <button
            className="button"
            disabled={busy}
            onClick={() => onAction("start-break")}
          >
            Start break
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onAction("check-out")}
          >
            Check out
          </button>
        </>
      );
  else if (record.status !== "Holiday")
    actions = (
      <button
        className="button primary"
        disabled={busy}
        onClick={() => onAction("check-in")}
      >
        Check in
      </button>
    );
  return (
    <section className="panel attendance-today">
      <div className="panel-head">
        <div>
          <p className="eyebrow">
            {record.needsCorrection ? "OPEN WORKDAY" : "TODAY’S ATTENDANCE"} ·{" "}
            {record.workDate}
          </p>
          <h2>{record.status}</h2>
          <small>
            {policy.startTime}–{policy.endTime} · {policy.timeZone} ·{" "}
            {duration(policy.expectedMinutes * 60)} expected
          </small>
        </div>
        <span
          className={`attendance-live-dot ${record.checkIn && !record.checkOut ? "active" : ""}`}
          aria-label={
            record.checkIn && !record.checkOut
              ? "Timer running"
              : "Timer stopped"
          }
        />
        {record.checkIn && <Status value={record.attendanceStatus} />}
      </div>
      <div className="attendance-body">
        <div className="attendance-metrics">
          <div className="attendance-main-metric">
            <small>Time worked</small>
            <strong>{duration(worked)}</strong>
            <span>of {duration(policy.expectedMinutes * 60)} expected</span>
          </div>
          <div>
            <small>Break time</small>
            <strong>{duration(breaks)}</strong>
          </div>
          <div>
            <small>Check in</small>
            <strong className="attendance-timestamp">
              {time(record.checkIn)}
            </strong>
          </div>
          <div>
            <small>Check out</small>
            <strong className="attendance-timestamp">
              {time(record.checkOut)}
            </strong>
          </div>
        </div>
        <div
          className="attendance-progress"
          role="progressbar"
          aria-label="Expected working hours"
          aria-valuenow={Math.min(
            100,
            Math.round(
              (worked / Math.max(1, policy.expectedMinutes * 60)) * 100,
            ),
          )}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            style={{
              width: `${Math.min(100, (worked / Math.max(1, policy.expectedMinutes * 60)) * 100)}%`,
            }}
          />
        </div>
        {record.status === "On Break" && (
          <p className="attendance-note">
            Break started {time(record.breaks.find((item) => !item.end)?.start)}
            . Break time is excluded from worked hours.
          </p>
        )}
        {record.actionsExpired ? (
          <p className="attendance-warning">
            This workday is over 24 hours old. Request a correction to close it
            before checking in again.
          </p>
        ) : (
          record.needsCorrection && (
            <p className="attendance-warning">
              A previous workday is still open. Finish it within 24 hours of
              check-in, or request a correction before checking in again.
            </p>
          )
        )}
        {record.status === "Holiday" && (
          <p className="attendance-note">
            Today is a non-working day. Submit a correction if you worked with
            approval.
          </p>
        )}
        {record.checkOut &&
          record.workedSeconds < policy.expectedMinutes * 60 && (
            <p className="attendance-note">
              {duration(policy.expectedMinutes * 60 - record.workedSeconds)}{" "}
              below expected working hours.
            </p>
          )}
        <div className="attendance-today-footer">
          <small>
            Times shown in your browser timezone. Server totals refresh every 30
            seconds.
          </small>
          <div className="attendance-actions">{actions}</div>
        </div>
      </div>
    </section>
  );
}
function AttendanceRows({ items, report, user, onCorrect, onResume }) {
  return items.length ? (
    items.map((record) => (
      <tr key={report ? record.employee.id : record.workDate}>
        {report ? (
          <>
            <td>
              <strong>{record.employee.name}</strong>
              {!record.employee.active && <small>Inactive account</small>}
            </td>
            <td>{record.employee.team?.name || "Unassigned"}</td>
          </>
        ) : (
          <td>
            <strong>{record.workDate}</strong>
          </td>
        )}
        <td>{time(record.checkIn)}</td>
        <td>{time(record.checkOut)}</td>
        <td>{duration(record.breakSeconds)}</td>
        <td>
          <strong>{duration(record.workedSeconds)}</strong>
        </td>
        <td>
          <Status value={record.status} />
          {record.checkIn && (
            <small>
              {record.attendanceStatus}
              {record.needsCorrection ? " · Needs correction" : ""}
            </small>
          )}
        </td>
        {report ? (
          isAdmin(user) && (
            <td>
              <ResumeButton
                user={user}
                record={record}
                name={record.employee.name}
                onResume={onResume}
              />
            </td>
          )
        ) : (
          <td>
            {record.status !== "Not employed" && (
              <button className="text-button" onClick={() => onCorrect(record)}>
                Request correction
              </button>
            )}
          </td>
        )}
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan={report && isAdmin(user) ? 8 : 7} className="empty">
        No attendance matches these filters.
      </td>
    </tr>
  );
}
function History({ data, today, filters, onFilters, user, onCorrect }) {
  return (
    <section className="panel attendance-history">
      <div className="panel-head">
        <div>
          <h2>My attendance history</h2>
          <small>
            Choose up to 93 days. Absence is counted after the scheduled work
            end.
          </small>
        </div>
        <span className="badge">{data.items.length} days</span>
      </div>
      <form
        className="filters attendance-filters"
        key={JSON.stringify(filters) + today}
        onSubmit={(event) => {
          event.preventDefault();
          onFilters(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        <label>
          From
          <input
            type="date"
            name="from"
            max={today}
            defaultValue={filters.from || data.items.at(-1)?.workDate || ""}
            required
          />
        </label>
        <label>
          To
          <input
            type="date"
            name="to"
            max={today}
            defaultValue={filters.to || today}
            required
          />
        </label>
        <button className="button">Apply dates</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Check in</th>
              <th>Check out</th>
              <th>Breaks</th>
              <th>Worked</th>
              <th>Status</th>
              <th>Correction</th>
            </tr>
          </thead>
          <tbody>
            <AttendanceRows
              items={data.items}
              user={user}
              onCorrect={onCorrect}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}
const CorrectionForm = forwardRef(function CorrectionForm(
  { api, notify, onSaved, today },
  ref,
) {
  const empty = () => ({
    workDate: "",
    checkIn: timestampField(),
    checkOut: timestampField(),
    breaks: [],
    reason: "",
  });
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const element = useRef(null);
  const input = useRef(null);
  useImperativeHandle(
    ref,
    () => ({
      fill(record) {
        setForm({
          workDate: record.workDate,
          checkIn: timestampField(record.checkIn),
          checkOut: timestampField(record.checkOut),
          breaks: record.breaks.map((item) => ({
            start: timestampField(item.start),
            end: timestampField(item.end),
          })),
          reason: "",
        });
        setError("");
        element.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        input.current?.focus({ preventScroll: true });
      },
    }),
    [],
  );
  const editTime = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: { value, original: "" } }));
  const editBreak = (index, key, value) =>
    setForm((previous) => ({
      ...previous,
      breaks: previous.breaks.map((item, position) =>
        position === index ? { ...item, [key]: { value, original: "" } } : item,
      ),
    }));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const proposed = {
        checkIn: inputUTC(form.checkIn),
        checkOut: inputUTC(form.checkOut),
        breaks: form.breaks.map((item) => ({
          start: inputUTC(item.start),
          end: inputUTC(item.end),
        })),
      };
      await api("/attendance/corrections", "POST", {
        workDate: form.workDate,
        reason: form.reason,
        proposed,
      });
      setForm(empty());
      notify("Correction submitted for administrator review.");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel attendance-correction" ref={element}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">NEED TO MAKE A CHANGE?</p>
          <h2>Request an attendance correction</h2>
          <small>
            Propose a full work period and every break. Official attendance
            changes after administrator approval.
          </small>
        </div>
      </div>
      <form className="attendance-form" onSubmit={submit}>
        <div className="attendance-form-grid">
          <label>
            Workday in workspace timezone
            <input
              type="date"
              required
              max={today}
              value={form.workDate}
              onChange={(event) =>
                setForm({ ...form, workDate: event.target.value })
              }
            />
          </label>
          <label>
            Requested check-in
            <input
              ref={input}
              type="datetime-local"
              required
              value={form.checkIn.value}
              onChange={(event) => editTime("checkIn", event.target.value)}
            />
          </label>
          <label>
            Requested checkout
            <input
              type="datetime-local"
              required
              value={form.checkOut.value}
              onChange={(event) => editTime("checkOut", event.target.value)}
            />
          </label>
        </div>
        <p className="attendance-note">
          Enter times in your browser timezone:{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}. Include every
          break to keep worked hours accurate.
        </p>
        {form.breaks.map((item, index) => (
          <div className="attendance-break-row" key={index}>
            <label>
              Break {index + 1} start
              <input
                type="datetime-local"
                required
                value={item.start.value}
                onChange={(event) =>
                  editBreak(index, "start", event.target.value)
                }
              />
            </label>
            <label>
              Break {index + 1} end
              <input
                type="datetime-local"
                required
                value={item.end.value}
                onChange={(event) =>
                  editBreak(index, "end", event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={() =>
                setForm({
                  ...form,
                  breaks: form.breaks.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={busy || form.breaks.length >= 20}
          onClick={() =>
            setForm({
              ...form,
              breaks: [
                ...form.breaks,
                { start: timestampField(), end: timestampField() },
              ],
            })
          }
        >
          + Add break period
        </button>
        <label>
          Reason
          <textarea
            required
            maxLength={1000}
            rows={3}
            placeholder="Explain the missing or incorrect attendance"
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
        </label>
        <div className="attendance-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit correction request"}
          </button>
          <span className="attendance-feedback" role="status">
            {error}
          </span>
        </div>
      </form>
    </section>
  );
});
function ReviewDecision({ request, api, notify, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const status = event.nativeEvent.submitter?.value;
    if (!status) return;
    setBusy(true);
    setError("");
    try {
      await api(`/attendance/corrections/${request.id}`, "PATCH", {
        status,
        reviewNote: note,
      });
      notify("Correction reviewed.");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="attendance-review-form" onSubmit={submit}>
      <label htmlFor={`note-${request.id}`}>
        Review note
        <input
          id={`note-${request.id}`}
          maxLength={1000}
          placeholder="Optional note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="attendance-actions">
        <button
          className="button primary"
          name="status"
          value="APPROVED"
          disabled={busy}
        >
          Approve
        </button>
        <button
          className="button"
          name="status"
          value="REJECTED"
          disabled={busy}
        >
          Reject
        </button>
      </div>
      <span className="attendance-feedback" role="status">
        {error}
      </span>
    </form>
  );
}
function Requests({ data, review, api, notify, onSaved, onPage }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{review ? "Correction review" : "My correction requests"}</h2>
          <small>
            {review
              ? "Review the complete proposed period. Administrators may approve their own requests."
              : "Follow your requests. Pending corrections do not change official attendance."}
          </small>
        </div>
        <span className="badge">{data.total} requests</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {review && <th>Employee</th>}
              <th>Workday</th>
              <th>Requested period</th>
              <th>Reason</th>
              <th>Status / review</th>
              {review && <th>Decision</th>}
            </tr>
          </thead>
          <tbody>
            {data.items.length ? (
              data.items.map((request) => (
                <tr key={request.id}>
                  {review && (
                    <td>
                      <strong>{request.user.name}</strong>
                      {request.user.active === false && (
                        <small>Inactive account</small>
                      )}
                    </td>
                  )}
                  <td>{request.workDate.slice(0, 10)}</td>
                  <td>
                    <div>{time(request.proposed.checkIn)}</div>
                    <div>{time(request.proposed.checkOut)}</div>
                    <details className="attendance-break-details">
                      <summary>
                        {request.proposed.breaks.length} break
                        {request.proposed.breaks.length !== 1 ? "s" : ""}
                      </summary>
                      {request.proposed.breaks.map((item, index) => (
                        <div key={index}>
                          {time(item.start)} → {time(item.end)}
                        </div>
                      ))}
                      {request.proposed.breaks.length === 0 && (
                        <div>No breaks</div>
                      )}
                    </details>
                  </td>
                  <td className="attendance-reason">{request.reason}</td>
                  <td>
                    <Status value={request.status} />
                    {(request.reviewer?.name || request.reviewNote) && (
                      <small>
                        {request.reviewer?.name}
                        {request.reviewNote ? ` · ${request.reviewNote}` : ""}
                      </small>
                    )}
                  </td>
                  {review && (
                    <td>
                      {request.status === "PENDING" ? (
                        <ReviewDecision
                          request={request}
                          api={api}
                          notify={notify}
                          onSaved={onSaved}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={review ? 6 : 4} className="empty">
                  No correction requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination data={data} onPage={onPage} />
    </section>
  );
}
function TeamReport({
  data,
  teams,
  members,
  filters,
  onFilters,
  onPage,
  user,
  onResume,
}) {
  return (
    <>
      <div className="attendance-summary">
        {[
          "Present",
          "Late",
          "Absent",
          "Working",
          "On Break",
          "Checked Out",
        ].map((status) => (
          <div className="panel attendance-stat" key={status}>
            <small>{status}</small>
            <strong>{data.summary[status]}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>
              {isAdmin(user)
                ? "Organisation attendance"
                : "My team’s attendance"}
            </h2>
            <small>
              Current team membership. Arrival and work status counts can
              overlap.
            </small>
          </div>
        </div>
        <form
          className="filters attendance-filters"
          key={JSON.stringify(filters)}
          onSubmit={(event) => {
            event.preventDefault();
            onFilters(Object.fromEntries(new FormData(event.currentTarget)));
          }}
        >
          <label>
            Date
            <input
              type="date"
              name="date"
              required
              max={data.today}
              defaultValue={filters.date || data.date}
            />
          </label>
          <label>
            Team
            <select name="teamId" defaultValue={filters.teamId || ""}>
              <option value="">All permitted teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Employee
            <select name="employeeId" defaultValue={filters.employeeId || ""}>
              <option value="">All permitted employees</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={filters.status || ""}>
              <option value="">All statuses</option>
              {Object.keys(data.summary).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <button className="button">Apply filters</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Team</th>
                <th>Check in</th>
                <th>Check out</th>
                <th>Breaks</th>
                <th>Worked</th>
                <th>Status</th>
                {isAdmin(user) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              <AttendanceRows
                items={data.items}
                report
                user={user}
                onResume={onResume}
              />
            </tbody>
          </table>
        </div>
        <Pagination data={data} noun="employees" onPage={onPage} />
      </section>
    </>
  );
}
function ResumeDialog({ record, api, notify, onClose, onSaved }) {
  const dialog = useRef(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/attendance/records/${record.id}/resume`, "POST", {
        version: record.version,
        reason,
      });
      notify(
        "Work timer resumed. The checked-out gap was recorded as a break.",
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="attendance-resume"
      aria-labelledby="attendance-resume-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form className="attendance-form" onSubmit={submit}>
        <p className="eyebrow">ATTENDANCE</p>
        <h2 id="attendance-resume-title">Resume work</h2>
        <p>
          Resume the work timer for <strong>{record.resumeName}</strong> after
          an accidental checkout.
        </p>
        <p className="attendance-note">
          The original check-in and worked time are kept. The gap after checkout
          is recorded as a break. Request a correction if that gap should count
          as worked time.
        </p>
        <label>
          Reason
          <textarea
            required
            maxLength={500}
            rows={3}
            placeholder="Explain the accidental checkout"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <span className="attendance-feedback" role="status">
          {error}
        </span>
        <div className="attendance-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Resuming…" : "Resume work"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Attendance({
  user,
  api,
  notify,
  members: suppliedMembers = [],
}) {
  const [tab, setTab] = useState("mine");
  const [historyFilters, setHistoryFilters] = useState({});
  const [reportFilters, setReportFilters] = useState({});
  const [requestPage, setRequestPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState(null);
  const [requests, setRequests] = useState(null);
  const [report, setReport] = useState(null);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState(suppliedMembers);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState(null);
  const [now, setNow] = useState(Date.now());
  const apiRef = useRef(api);
  apiRef.current = api;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const busyRef = useRef(false);
  const correction = useRef(null);
  const callApi = useCallback((...args) => apiRef.current(...args), []);
  const announce = useCallback((...args) => notifyRef.current(...args), []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    setReport(null);
    setTeams([]);
    setMembers([]);
  }, [user.id, user.role, user.teamId, user.orgId]);
  useEffect(() => {
    if (
      (tab === "review" && !isAdmin(user)) ||
      (tab === "team" && !isManager(user))
    )
      setTab("mine");
  }, [tab, user.role]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (tab === "mine") {
          const [day, past, corrections] = await Promise.all([
            callApi("/attendance/today"),
            callApi(
              `/attendance/history?${new URLSearchParams(historyFilters)}`,
            ),
            callApi(`/attendance/corrections?page=${requestPage}`),
          ]);
          if (!cancelled) {
            setToday({ ...day, receivedAt: Date.now() });
            setHistory(past);
            setRequests(corrections);
          }
        } else if (tab === "team" && isManager(user)) {
          const [result, people, permittedTeams] = await Promise.all([
            callApi(`/attendance/report?${new URLSearchParams(reportFilters)}`),
            callApi("/members"),
            callApi("/teams"),
          ]);
          if (!cancelled) {
            setReport(result);
            setMembers(people);
            setTeams(permittedTeams);
          }
        } else if (tab === "review" && isAdmin(user)) {
          const result = await callApi(
            `/attendance/corrections?view=review&page=${requestPage}`,
          );
          if (!cancelled) setRequests(result);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    tab,
    historyFilters,
    reportFilters,
    requestPage,
    revision,
    callApi,
    user.role,
    user.id,
    user.teamId,
    user.orgId,
  ]);
  useEffect(() => {
    if (tab !== "mine") return;
    let cancelled = false;
    let refreshing = false;
    async function refreshToday() {
      if (document.hidden || busyRef.current || refreshing) return;
      refreshing = true;
      try {
        const result = await callApi("/attendance/today");
        if (!cancelled) setToday({ ...result, receivedAt: Date.now() });
      } catch (err) {
        if (!cancelled)
          announce(`Attendance could not refresh: ${err.message}`, true);
      } finally {
        refreshing = false;
      }
    }
    const interval = setInterval(refreshToday, 30000);
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", refreshToday);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", refreshToday);
    };
  }, [tab, callApi, announce]);
  async function action(name) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await callApi(`/attendance/${name}`, "POST", {});
      const result = await callApi("/attendance/today");
      setToday({ ...result, receivedAt: Date.now() });
      refresh();
      announce("Attendance updated.");
    } catch (err) {
      announce(err.message, true);
      refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function applyHistory(filters) {
    if (
      filters.from > filters.to ||
      new Date(filters.to) - new Date(filters.from) > 92 * 86400000
    ) {
      announce("Choose an ordered date range of at most 93 days.", true);
      return;
    }
    setHistoryFilters(filters);
  }
  function switchTab(next) {
    setTab(next);
    setRequestPage(1);
    setRequests(null);
    setError("");
  }
  const savedCorrection = () => {
    setRequestPage(1);
    refresh();
  };
  return (
    <div className="attendance-layout">
      <nav className="attendance-tabs" aria-label="Attendance views">
        {[
          ["mine", "My attendance"],
          ...(isManager(user)
            ? [["team", isAdmin(user) ? "Organisation" : "My team"]]
            : []),
          ...(isAdmin(user) ? [["review", "Correction review"]] : []),
        ].map(([id, name]) => (
          <button
            key={id}
            className={`button ${tab === id ? "primary" : ""}`}
            aria-pressed={tab === id}
            onClick={() => switchTab(id)}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <div className="attendance-warning" role="alert">
          {error}{" "}
          <button className="text-button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {loading && (
        <div className="attendance-loading" role="status">
          Updating attendance…
        </div>
      )}
      {tab === "mine" && today && history && (
        <>
          <TodayCard
            data={today}
            user={user}
            busy={busy}
            onAction={action}
            onCorrect={(record) => correction.current?.fill(record)}
            onResume={setResume}
            now={now}
          />
          <History
            data={history}
            today={today.today.workDate}
            filters={historyFilters}
            onFilters={applyHistory}
            user={user}
            onCorrect={(record) => correction.current?.fill(record)}
          />
          <CorrectionForm
            ref={correction}
            api={callApi}
            notify={announce}
            onSaved={savedCorrection}
            today={today.today.workDate}
          />
          {requests && (
            <Requests
              data={requests}
              api={callApi}
              notify={announce}
              onSaved={refresh}
              onPage={setRequestPage}
            />
          )}
        </>
      )}
      {tab === "team" && report && (
        <TeamReport
          data={report}
          teams={teams}
          members={members}
          filters={reportFilters}
          onFilters={(filters) => setReportFilters({ ...filters, page: "1" })}
          onPage={(page) =>
            setReportFilters({ ...reportFilters, page: String(page) })
          }
          user={user}
          onResume={setResume}
        />
      )}
      {tab === "review" && requests && (
        <Requests
          data={requests}
          review
          api={callApi}
          notify={announce}
          onSaved={refresh}
          onPage={setRequestPage}
        />
      )}
      {resume && (
        <ResumeDialog
          record={resume}
          api={callApi}
          notify={announce}
          onClose={() => setResume(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

export function AttendancePolicy({ user, api, notify }) {
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    if (!isAdmin(user)) return;
    let cancelled = false;
    apiRef
      .current("/attendance/settings")
      .then((result) => {
        if (!cancelled) {
          setPolicy({ ...result, expectedHours: result.expectedMinutes / 60 });
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [user.role, user.id, revision]);
  if (!isAdmin(user)) return null;
  const edit = (key, value) => {
    setPolicy({ ...policy, [key]: value });
    setMessage("");
  };
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        timeZone: policy.timeZone,
        startTime: policy.startTime,
        endTime: policy.endTime,
        graceMinutes: Number(policy.graceMinutes),
        expectedMinutes: Math.round(Number(policy.expectedHours) * 60),
        workingDays: policy.workingDays,
      };
      const result = await apiRef.current(
        "/attendance/settings",
        "PUT",
        payload,
      );
      setPolicy({ ...result, expectedHours: result.expectedMinutes / 60 });
      setMessage("Attendance settings saved.");
      notify("Attendance settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel attendance-policy">
      <div className="panel-head">
        <div>
          <h2>Attendance settings</h2>
          <small>
            Set the work schedule for your organisation. Existing attendance
            keeps the policy captured at check-in.
          </small>
        </div>
      </div>
      {!policy ? (
        <div className="attendance-form" role="status">
          {error ? (
            <>
              {error}{" "}
              <button
                className="text-button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Try again
              </button>
            </>
          ) : (
            "Loading attendance settings…"
          )}
        </div>
      ) : (
        <form className="attendance-form" onSubmit={submit}>
          <fieldset>
            <legend>Working days</legend>
            <div className="attendance-days">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, index) => (
                  <label
                    key={day}
                    className={
                      policy.workingDays.includes(index) ? "selected" : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={policy.workingDays.includes(index)}
                      onChange={(event) =>
                        edit(
                          "workingDays",
                          event.target.checked
                            ? [...policy.workingDays, index].sort()
                            : policy.workingDays.filter(
                                (value) => value !== index,
                              ),
                        )
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <div className="attendance-form-grid">
            <label>
              Workspace timezone
              <input
                required
                maxLength={80}
                placeholder="Asia/Kolkata"
                value={policy.timeZone}
                onChange={(event) => edit("timeZone", event.target.value)}
              />
              <small>Use an IANA name such as Asia/Kolkata or UTC.</small>
            </label>
            <label>
              Work start
              <input
                type="time"
                required
                value={policy.startTime}
                onChange={(event) => edit("startTime", event.target.value)}
              />
            </label>
            <label>
              Work end
              <input
                type="time"
                required
                value={policy.endTime}
                onChange={(event) => edit("endTime", event.target.value)}
              />
            </label>
            <label>
              Late grace period (minutes)
              <input
                type="number"
                required
                min={0}
                max={180}
                value={policy.graceMinutes}
                onChange={(event) => edit("graceMinutes", event.target.value)}
              />
            </label>
            <label>
              Expected working hours
              <input
                type="number"
                required
                min="0.0166667"
                max={24}
                step="any"
                value={policy.expectedHours}
                onChange={(event) => edit("expectedHours", event.target.value)}
              />
            </label>
          </div>
          <p className="attendance-note">
            Off days appear as Holiday. Overnight schedules are not supported.
            Changes apply to new check-ins and unrecorded dates.
          </p>
          <div className="attendance-actions">
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save attendance settings"}
            </button>
            <span className="attendance-feedback" role="status">
              {error || message}
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
