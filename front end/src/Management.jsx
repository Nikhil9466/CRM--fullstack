import React, { useEffect, useRef, useState } from "react";
import { Empty, Pager } from "./ui.jsx";
import { money, dateLabel, roleLabel, initials } from "./util.js";
import { AttendancePolicy } from "./Attendance.jsx";
import "./management.css";

const manager = (user) => ["ADMIN", "SUB_ADMIN"].includes(user?.role);
const stamp = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const Status = ({ value }) => (
  <span
    className={`badge management-status ${value === "Active" || value === "APPROVED" ? "success" : value === "Inactive" || value === "REJECTED" ? "muted" : ""}`}
  >
    {value}
  </span>
);

export function Profile({ user, notify, onLogout }) {
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const details = [
    ["Full name", user.name],
    ["Email address", user.email],
    ["Phone number", user.phone],
    ["Role", roleLabel(user.role)],
    ["Organisation", user.orgId],
    ["Team", user.team?.name || "Not assigned to a team"],
    ["Account status", user.active ? "Active" : "Inactive"],
    ["Member since", dateLabel(user.createdAt)],
  ];
  async function switchAccount() {
    setBusy(true);
    try {
      await (onLogout ? onLogout() : window.crmSession.logout());
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="management-stack">
      <section className="panel management-profile">
        <div className="management-profile-hero">
          <span className="avatar management-profile-avatar">
            {initials(user.name)}
          </span>
          <div>
            <p className="eyebrow">YOUR ACCOUNT</p>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <Status value={roleLabel(user.role)} />
          </div>
        </div>
        <dl className="management-profile-details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel management-security">
        <div>
          <h2>Account security</h2>
          <p>Keep your account protected with a strong password.</p>
        </div>
        <div className="management-actions">
          <a href="account.html" className="button">
            Change password
          </a>
          <button className="button" disabled={busy} onClick={switchAccount}>
            {busy ? "Signing out…" : "Switch account"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function Settings({
  user,
  api,
  notify,
  onEdit,
  onNew,
  members = [],
  stages = [],
  teams = [],
  reloadMetadata,
}) {
  const [busy, setBusy] = useState("");
  const isAdmin = user?.role === "ADMIN";
  async function action(key, path, method, body, message) {
    if (busy) return;
    setBusy(key);
    try {
      await api(path, method, body);
      await reloadMetadata?.();
      notify(message);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy("");
    }
  }
  function removeMember(member) {
    if (
      !window.confirm(
        `Remove ${member.name} from the team? Their account and assigned work will be kept.`,
      )
    )
      return;
    action(
      member.id,
      `/teams/${member.teamId}/members/${member.id}`,
      "DELETE",
      undefined,
      "Employee removed from the team.",
    );
  }
  function changeRole(member, role) {
    if (
      role === member.role ||
      !window.confirm(
        `Change ${member.name} to ${roleLabel(role)}? Changing a team leader’s role removes their leadership.`,
      )
    )
      return;
    action(
      member.id,
      `/members/${member.id}`,
      "PATCH",
      { role },
      "Role updated.",
    );
  }
  if (!manager(user))
    return (
      <Empty
        title="Team management permission required"
        description="Your administrator manages the workspace settings."
      />
    );
  return (
    <div className="management-stack">
      <div className="management-links">
        <a className="button" href="#recycle-bin">
          Recycle bin
        </a>
        {isAdmin && (
          <a className="button" href="#activity">
            Activity history
          </a>
        )}
      </div>
      <a className="panel management-team-link" href="#teams">
        <div>
          <p className="eyebrow">TEAM MANAGEMENT</p>
          <h2>Teams &amp; performance</h2>
          <p>
            {isAdmin
              ? "Manage your teams, review employee requests, and follow progress across your organisation."
              : "Manage your team, request employees, and follow everyone’s progress."}
          </p>
        </div>
        <span aria-hidden="true">↗</span>
      </a>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{isAdmin ? "People & access" : "Your team members"}</h2>
            <p>
              {isAdmin
                ? "Create a new CRM account here. Assign existing employees and appoint leaders in Teams & performance."
                : "Remove employees here, or request additions from Teams & performance."}
            </p>
          </div>
          {isAdmin && (
            <button className="button primary" onClick={() => onNew("members")}>
              + Create employee
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="management-person">
                      <span className="avatar management-small-avatar">
                        {initials(member.name)}
                      </span>
                      <div>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {isAdmin && member.id !== user.id ? (
                      <select
                        aria-label={`Role for ${member.name}`}
                        value={member.role}
                        disabled={Boolean(busy)}
                        onChange={(event) =>
                          changeRole(member, event.target.value)
                        }
                      >
                        {["EMPLOYEE", "SUB_ADMIN", "ADMIN"].map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      roleLabel(member.role)
                    )}
                  </td>
                  <td>
                    {teams.find((team) => team.id === member.teamId)?.name ||
                      "Unassigned"}
                  </td>
                  <td>
                    <Status value={member.active ? "Active" : "Inactive"} />
                  </td>
                  <td>
                    <div className="management-row-actions">
                      {isAdmin && member.id !== user.id && (
                        <>
                          <button
                            className="text-button"
                            disabled={Boolean(busy)}
                            onClick={() => onEdit("member-passwords", member)}
                          >
                            Reset password
                          </button>
                          <button
                            className="text-button danger"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${member.active ? "Deactivate" : "Activate"} ${member.name}?`,
                                )
                              )
                                action(
                                  member.id,
                                  `/members/${member.id}`,
                                  "PATCH",
                                  { active: !member.active },
                                  "Team access updated.",
                                );
                            }}
                          >
                            {member.active ? "Deactivate" : "Activate"}
                          </button>
                        </>
                      )}
                      {member.teamId && member.role === "EMPLOYEE" && (
                        <button
                          className="text-button danger"
                          disabled={Boolean(busy)}
                          onClick={() => removeMember(member)}
                        >
                          Remove from team
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!members.length && (
          <Empty
            title="No members to show"
            description="Members in your permitted view appear here."
          />
        )}
      </section>
      {isAdmin && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Pipeline stages</h2>
              <p>
                Shared across your organisation. Outcome types stay fixed to
                protect reports.
              </p>
            </div>
            <button className="button" onClick={() => onNew("stages")}>
              + Add stage
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Outcome</th>
                  <th>Position</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.id}>
                    <td>
                      <strong>{stage.name}</strong>
                    </td>
                    <td>
                      <Status value={stage.kind} />
                    </td>
                    <td>{stage.position}</td>
                    <td>
                      <div className="management-row-actions">
                        <button
                          className="text-button"
                          onClick={() => onEdit("stages", stage)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button danger"
                          disabled={Boolean(busy)}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Permanently delete this unused pipeline stage? Stages are not kept in the recycle bin.",
                              )
                            )
                              action(
                                stage.id,
                                `/stages/${stage.id}`,
                                "DELETE",
                                undefined,
                                "Pipeline stage deleted.",
                              );
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!stages.length && (
            <Empty
              title="No pipeline stages"
              description="Add a stage to organise deals."
            />
          )}
        </section>
      )}
      {isAdmin && <AttendancePolicy user={user} api={api} notify={notify} />}
    </div>
  );
}

function PerformanceTable({ rows, teams, byTeam = false }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{byTeam ? "Team" : "Employee"}</th>
            <th>{byTeam ? "People" : "Team / role"}</th>
            <th>Contacts</th>
            <th>Deals</th>
            <th>Won</th>
            <th>Won value</th>
            <th>Tasks completed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                {!byTeam && !row.active && <small>Inactive</small>}
              </td>
              <td>
                {byTeam ? (
                  row.members
                ) : (
                  <>
                    {teams.find((team) => team.id === row.teamId)?.name ||
                      "Unassigned"}
                    <small>{roleLabel(row.role)}</small>
                  </>
                )}
              </td>
              <td>{row.contacts}</td>
              <td>{row.deals}</td>
              <td>{row.won}</td>
              <td>{money(row.revenue)}</td>
              <td>
                <span>
                  {row.completed} / {row.tasks}
                </span>
                <div className="management-progress">
                  <span
                    style={{
                      width: `${row.tasks ? Math.min(100, (row.completed / row.tasks) * 100) : 0}%`,
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          title="No performance records yet"
          description="Activity will appear as your team adds contacts, deals and tasks."
        />
      )}
    </div>
  );
}

export function Teams({
  user,
  api,
  notify,
  onEdit,
  onNew,
  reloadMetadata,
  revision = 0,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selections, setSelections] = useState({});
  const isAdmin = user?.role === "ADMIN";
  useEffect(() => {
    let active = true;
    setData(null);
    setSelections({});
    setError("");
    if (!manager(user)) return;
    Promise.all(
      [
        "/teams",
        "/members",
        "/team-requests",
        "/team-candidates",
        "/performance",
      ].map((path) => api(path)),
    )
      .then(([teams, members, requests, candidates, performance]) => {
        if (active)
          setData({ teams, members, requests, candidates, performance });
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [api, refresh, revision, user?.role, user?.teamId]);
  async function action(key, path, method, body, message) {
    if (busy) return;
    setBusy(key);
    try {
      await api(path, method, body);
      await reloadMetadata?.();
      setRefresh((value) => value + 1);
      setSelections({});
      notify(message);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy("");
    }
  }
  if (!manager(user))
    return (
      <Empty
        title="Team management permission required"
        description="Your administrator manages team access."
      />
    );
  if (error)
    return (
      <section className="panel">
        <Empty title="Couldn’t load teams" description={error} />
        <button
          className="button"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Retry
        </button>
      </section>
    );
  if (!data)
    return (
      <section className="panel">
        <Empty title="Loading your teams…" />
      </section>
    );
  return (
    <div className="management-stack">
      <div className="management-links">
        <a href="#settings" className="text-button">
          ← Team &amp; settings
        </a>
        {isAdmin && (
          <button className="button primary" onClick={() => onNew("teams")}>
            + Create team
          </button>
        )}
      </div>
      <div className="management-teams">
        {data.teams.map((team) => {
          const people = data.members.filter(
            (member) => member.teamId === team.id,
          );
          const candidates = isAdmin
            ? data.members.filter(
                (member) =>
                  member.active &&
                  member.role === "EMPLOYEE" &&
                  member.teamId !== team.id,
              )
            : data.candidates;
          return (
            <section className="panel management-team-card" key={team.id}>
              <div className="panel-head">
                <div>
                  <h2>{team.name}</h2>
                  <p>
                    Led by{" "}
                    {data.members.find((member) => member.id === team.leaderId)
                      ?.name || "No leader assigned"}
                  </p>
                </div>
                <span className="badge">{people.length} people</span>
              </div>
              <div className="management-team-body">
                {isAdmin && (
                  <button
                    className="text-button"
                    onClick={() => onEdit("teams", team)}
                  >
                    Edit team / appoint leader
                  </button>
                )}
                <ul className="management-roster">
                  {people.map((member) => (
                    <li key={member.id}>
                      <div className="management-person">
                        <span className="avatar management-small-avatar">
                          {initials(member.name)}
                        </span>
                        <div>
                          <strong>{member.name}</strong>
                          <small>
                            {roleLabel(member.role)}
                            {member.active ? "" : " · Inactive"}
                          </small>
                        </div>
                      </div>
                      {member.role === "EMPLOYEE" ? (
                        <button
                          className="text-button danger"
                          disabled={Boolean(busy)}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${member.name} from the team? Their account and assigned work will be kept.`,
                              )
                            )
                              action(
                                member.id,
                                `/teams/${team.id}/members/${member.id}`,
                                "DELETE",
                                undefined,
                                "Employee removed from the team.",
                              );
                          }}
                        >
                          Remove
                        </button>
                      ) : (
                        <Status value="Leader" />
                      )}
                    </li>
                  ))}
                </ul>
                {!people.length && (
                  <p className="management-muted">No members yet.</p>
                )}
                <form
                  className="management-team-add"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const employeeId = selections[team.id];
                    if (!employeeId) return;
                    if (
                      isAdmin &&
                      !window.confirm(
                        "Assign this employee to this team? This replaces their current team assignment.",
                      )
                    )
                      return;
                    action(
                      team.id,
                      `/teams/${team.id}/${isAdmin ? "members" : "requests"}`,
                      "POST",
                      { employeeId },
                      isAdmin
                        ? "Employee assigned to team."
                        : "Request sent to your admin for approval.",
                    );
                  }}
                >
                  <label>
                    {isAdmin ? "Assign employee" : "Request an employee"}
                    <select
                      required
                      aria-label={`${isAdmin ? "Assign employee" : "Request an employee"} to ${team.name}`}
                      value={selections[team.id] || ""}
                      onChange={(event) =>
                        setSelections((current) => ({
                          ...current,
                          [team.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Choose an employee</option>
                      {candidates.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button"
                    disabled={Boolean(busy) || !candidates.length}
                  >
                    {busy === team.id
                      ? "Saving…"
                      : isAdmin
                        ? "Assign employee"
                        : "Request approval"}
                  </button>
                </form>
                <small className="management-muted">
                  {isAdmin
                    ? "Assign employee adds an existing CRM account to this team, transferring them from their current team, if any."
                    : "An admin approves additions. Removing a member keeps their account and work."}
                </small>
              </div>
            </section>
          );
        })}
      </div>
      {!data.teams.length && (
        <section className="panel">
          <Empty
            title="No teams yet"
            description={
              isAdmin
                ? "Create a team and appoint a sub-admin to lead it."
                : "Ask your admin to assign you as a team leader."
            }
          />
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Employee requests</h2>
            <p>
              {isAdmin
                ? "Review additions before employees move into a team."
                : "Follow requests for your team."}
            </p>
          </div>
          <span className="badge">
            {
              data.requests.filter((request) => request.status === "PENDING")
                .length
            }{" "}
            pending
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Requested team</th>
                <th>Requested by</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.employeeName}</strong>
                  </td>
                  <td>{request.team.name}</td>
                  <td>
                    {request.requesterName}
                    <small>{dateLabel(request.createdAt)}</small>
                  </td>
                  <td>
                    <Status value={request.status} />
                  </td>
                  <td>
                    {isAdmin && request.status === "PENDING" ? (
                      <div className="management-row-actions">
                        {["APPROVED", "REJECTED"].map((status) => (
                          <button
                            key={status}
                            className={`text-button ${status === "REJECTED" ? "danger" : ""}`}
                            disabled={Boolean(busy)}
                            onClick={() => {
                              if (
                                window.confirm(
                                  status === "APPROVED"
                                    ? "Approve this employee’s move into the requested team?"
                                    : "Reject this request?",
                                )
                              )
                                action(
                                  request.id,
                                  `/team-requests/${request.id}`,
                                  "PATCH",
                                  { status },
                                  "Request reviewed.",
                                );
                            }}
                          >
                            {status === "APPROVED" ? "Approve" : "Reject"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.requests.length && (
            <Empty
              title="No employee requests"
              description="New requests and their decisions appear here."
            />
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Team performance</h2>
            <p>
              All time · based on current team membership and record
              assignments.
            </p>
          </div>
        </div>
        <PerformanceTable
          rows={data.performance.teams}
          teams={data.teams}
          byTeam
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Employee performance</h2>
            <p>Deals follow the contact owner. Tasks follow their assignee.</p>
          </div>
        </div>
        <PerformanceTable
          rows={data.performance.employees}
          teams={data.teams}
        />
      </section>
    </div>
  );
}

const activityTypes = {
  "": "All types",
  contact: "Contacts",
  deal: "Deals",
  task: "Tasks",
  user: "People & access",
  team: "Teams",
  teamRequest: "Team requests",
  stage: "Pipeline stages",
  attendance: "Attendance",
};
const historyActions = {
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
const historyFields = {
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
function historyValue(value, refs) {
  if (value === null) return "Unassigned";
  if (refs && Object.hasOwn(refs, value)) return refs[value];
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return (
      value
        .map((item) =>
          typeof item === "object"
            ? `${item.start || "—"} → ${item.end || "—"}`
            : String(item),
        )
        .join(", ") || "None"
    );
  if (typeof value === "object") return JSON.stringify(value);
  return String(value ?? "—").replaceAll("_", " ");
}
function HistoryDetails({ item }) {
  const details = item.details || {};
  const entries = Object.entries(details).filter(([key]) => historyFields[key]);
  return entries.length ? (
    <div className="management-history-details">
      {entries.map(([key, value]) => (
        <div key={key}>
          <strong>{historyFields[key]}:</strong>{" "}
          {details.previous && Object.hasOwn(details.previous, key) && (
            <>
              {historyValue(details.previous[key], details.references)}{" "}
              <span aria-label="changed to">→</span>{" "}
            </>
          )}
          {historyValue(value, details.references)}
        </div>
      ))}
    </div>
  ) : (
    "—"
  );
}

export function History({ type = "activity", user, api, notify }) {
  const activity = type === "activity";
  const [filters, setFilters] = useState({ type: activity ? "" : "contacts" });
  const [draft, setDraft] = useState({ type: activity ? "" : "contacts" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  const lastType = useRef(type);
  useEffect(() => {
    if (lastType.current === type) return;
    lastType.current = type;
    const next = { type: activity ? "" : "contacts" };
    setFilters(next);
    setDraft(next);
    setPage(1);
    setData(null);
  }, [type]);
  useEffect(() => {
    const version = ++request.current;
    setError("");
    setData(null);
    if (activity ? user?.role !== "ADMIN" : !manager(user)) return;
    api(`/${type}?${new URLSearchParams({ ...filters, page })}`)
      .then((result) => {
        if (version === request.current) setData(result);
      })
      .catch((err) => {
        if (version === request.current) setError(err.message);
      });
    return () => {
      request.current++;
    };
  }, [api, type, filters, page, refresh, user?.role, user?.teamId]);
  async function restore(item) {
    if (busy) return;
    setBusy(item.id);
    try {
      await api(`/recycle-bin/${data.type}/${item.id}/restore`, "POST");
      setRefresh((value) => value + 1);
      notify(
        "Record restored. Review its assignment if team membership has changed.",
      );
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy("");
    }
  }
  if (activity ? user?.role !== "ADMIN" : !manager(user))
    return (
      <Empty
        title="Permission required"
        description="Your current role cannot open this view."
      />
    );
  const choices = activity
    ? activityTypes
    : { contacts: "Contacts", deals: "Deals", tasks: "Tasks" };
  const update = (name, value) =>
    setDraft((current) => ({ ...current, [name]: value }));
  return (
    <div className="management-stack">
      <div className="management-links">
        <a href="#settings" className="text-button">
          ← Team &amp; settings
        </a>
      </div>
      <section className="panel">
        <form
          className="filters management-history-filters"
          onSubmit={(event) => {
            event.preventDefault();
            if (activity && draft.from && draft.to && draft.from > draft.to) {
              notify("Choose a start date before the end date.", true);
              return;
            }
            setFilters({ ...draft });
            setPage(1);
          }}
        >
          <label>
            Record type
            <select
              name="type"
              value={draft.type || (activity ? "" : "contacts")}
              onChange={(event) => update("type", event.target.value)}
            >
              {Object.entries(choices).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              name="q"
              type="search"
              maxLength="120"
              value={draft.q || ""}
              onChange={(event) => update("q", event.target.value)}
              placeholder={
                activity ? "Person, record or action" : "Record name"
              }
            />
          </label>
          {activity && (
            <>
              <label>
                From
                <input
                  name="from"
                  type="date"
                  value={draft.from || ""}
                  onChange={(event) => update("from", event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  name="to"
                  type="date"
                  value={draft.to || ""}
                  onChange={(event) => update("to", event.target.value)}
                />
              </label>
            </>
          )}
          <button className="button" type="submit">
            Apply filters
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              const next = { type: activity ? "" : "contacts" };
              setDraft(next);
              setFilters(next);
              setPage(1);
            }}
          >
            Clear
          </button>
        </form>
        <p className="management-history-note">
          {activity
            ? "Organisation history · date filters use UTC. Passwords and session secrets are never recorded."
            : "Restore linked contacts before deals, and deals before tasks. Records keep their original assignments; your current team permissions apply."}
        </p>
        {error ? (
          <>
            <Empty title="Couldn’t load history" description={error} />
            <button
              className="button management-retry"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Retry
            </button>
          </>
        ) : !data ? (
          <Empty title="Loading records…" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {(activity
                      ? ["When", "Changed by", "Action", "Record", "Details"]
                      : ["Record", "Deleted on", "Deleted by", "Actions"]
                    ).map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) =>
                    activity ? (
                      <tr key={item.id}>
                        <td className="management-history-time">
                          {stamp(item.createdAt)}
                        </td>
                        <td>{item.actorName}</td>
                        <td>
                          {historyActions[item.action] ||
                            item.action.replaceAll("_", " ")}
                        </td>
                        <td>
                          <strong>{item.entityLabel}</strong>
                          <small>
                            {activityTypes[item.entityType] || item.entityType}
                          </small>
                        </td>
                        <td>
                          <HistoryDetails item={item} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.label}</strong>
                        </td>
                        <td>{stamp(item.deletedAt)}</td>
                        <td>{item.deletedByName}</td>
                        <td>
                          <button
                            className="button"
                            disabled={Boolean(busy)}
                            onClick={() => restore(item)}
                          >
                            {busy === item.id ? "Restoring…" : "Restore"}
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {!data.items.length && (
                <Empty
                  title={
                    activity
                      ? "No activity matches these filters"
                      : "No deleted records match these filters"
                  }
                  description={
                    activity
                      ? "Try another date range or search term."
                      : "Deleted records appear here until restored."
                  }
                />
              )}
            </div>
            <Pager data={data} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
