import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { syncTheme, toggleTheme } from "./theme-transition.js";
import {
  api,
  allChoices,
  compactMoney,
  dateLabel,
  initials,
  money,
  roleLabel,
  today,
} from "./util.js";
import { Brand, Empty, Icon, Loading, Modal, Pager } from "./ui.jsx";
import Attendance from "./Attendance.jsx";
import Documents from "./Documents.jsx";
import { History, Profile, Settings, Teams } from "./Management.jsx";

const labels = {
  overview: "Overview",
  contacts: "Contacts",
  deals: "Deals",
  tasks: "Tasks",
  documents: "Document centre",
  attendance: "Attendance",
  settings: "Team & settings",
  teams: "Teams & performance",
  profile: "Your profile",
  activity: "Activity history",
  "recycle-bin": "Recycle bin",
};
const subtitles = {
  overview: "A clear view of your relationships, opportunities and next steps.",
  contacts: "The people behind every great relationship.",
  deals: "Keep every opportunity moving in the right direction.",
  tasks: "A little organisation. A lot of forward motion.",
  documents: "Your files, organised and always within reach.",
  attendance: "Make every workday count.",
  settings: "A well organised workspace starts with your team.",
  teams: "Bring your people together. See their progress.",
  profile: "Your account and your place in the team.",
  activity: "A complete view of changes across your workspace.",
  "recycle-bin":
    "Recover deleted work. Restore contacts before linked deals and tasks.",
};
const manager = (user) => ["ADMIN", "SUB_ADMIN"].includes(user?.role);
function useData(path) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setError("");
    setData(null);
    api(path)
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [path, attempt]);
  return {
    data,
    error,
    update: setData,
    retry: () => setAttempt((x) => x + 1),
  };
}
function DataError({ error, retry }) {
  return (
    <section className="panel">
      <Empty title="We couldn’t load this view" description={error}>
        <button className="button" onClick={retry}>
          <Icon name="refresh" size={16} />
          Retry
        </button>
      </Empty>
    </section>
  );
}

function Overview({ onNew, notify }) {
  const { data: d, error, retry } = useData("/dashboard?today=" + today());
  const [busy, setBusy] = useState("");
  if (error) return <DataError error={error} retry={retry} />;
  if (!d) return <Loading />;
  const max = Math.max(1, ...d.monthly.map((m) => m.count));
  const wins = d.monthly.reduce((n, m) => n + m.count, 0);
  const pipelineTotal = d.pipeline.reduce((n, s) => n + s.count, 0);
  const totalValue = d.pipeline
    .filter((s) => s.kind === "OPEN")
    .reduce((n, s) => n + Number(s.value), 0);
  const kpis = [
    [
      "Total contacts",
      d.kpis.contacts,
      "contacts",
      "People in your workspace",
      "mint",
    ],
    [
      "Active deals",
      d.kpis.activeDeals,
      "deals",
      compactMoney(d.kpis.openValue) + " in open pipeline",
      "blue",
    ],
    [
      "Won this month",
      compactMoney(d.kpis.wonThisMonth),
      "wallet",
      "Value of deals won · UTC month",
      "peach",
    ],
    [
      "Pending tasks",
      d.kpis.pendingTasks,
      "tasks",
      d.dueCount + " due today",
      "violet",
    ],
  ];
  async function complete(id) {
    setBusy(id);
    try {
      await api("/tasks/" + id, "PATCH", { completed: true });
      notify("Task completed. One less thing on your list.");
      retry();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="kpis">
        {kpis.map(([label, value, icon, foot, color], index) => (
          <article
            className={"kpi kpi-" + color}
            key={label}
            style={{ "--enter-delay": index * 65 + "ms" }}
          >
            <div className="kpi-top">
              <span>{label}</span>
              <span className={"kpi-icon " + color}>
                <Icon name={icon} />
              </span>
            </div>
            <p className="kpi-value">{value}</p>
            <p className="kpi-foot">
              <span className="tiny-dot" />
              {foot}
            </p>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel progress-panel">
          <div className="panel-head">
            <div>
              <h2>Small wins, steady progress</h2>
              <p>Deals won over the last six months</p>
            </div>
            <span className="pill">
              <Icon name="clock" size={14} />
              Last 6 months
            </span>
          </div>
          <div className="chart-top">
            <strong>
              {wins}
              <span> deals won</span>
            </strong>
            <span className="chart-legend">
              <i />
              Monthly wins
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={d.monthly
              .map((m) => m.month + ": " + m.count + " wins, " + money(m.value))
              .join("; ")}
          >
            <div className="chart-grid" aria-hidden="true">
              {(max <= 4
                ? Array.from({ length: max + 1 }, (_, i) => max - i)
                : [
                    max,
                    Math.round(max * 0.75),
                    Math.round(max * 0.5),
                    Math.round(max * 0.25),
                    0,
                  ]
              ).map((n) => (
                <div key={n}>
                  <span>{n}</span>
                  <i />
                </div>
              ))}
            </div>
            <div className="chart-columns">
              {d.monthly.map((m, i) => (
                <div className="bar-column" key={m.month}>
                  <div className="bar-space">
                    <div
                      className={
                        "bar " + (i === d.monthly.length - 1 ? "latest" : "")
                      }
                      style={{
                        "--chart-delay": 180 + i * 75 + "ms",
                        height:
                          Math.max(m.count ? 5 : 0, (m.count / max) * 100) +
                          "%",
                      }}
                      title={m.count + " deals won · " + money(m.value)}
                    >
                      {m.count > 0 && <span>{m.count}</span>}
                    </div>
                  </div>
                  <small>
                    {new Date(m.month + "-01T12:00:00Z").toLocaleDateString(
                      "en",
                      { month: "short", timeZone: "UTC" },
                    )}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-summary">
            <span>
              {wins
                ? "Every win starts with a conversation."
                : "Move a deal to a Won stage to start tracking."}
            </span>
            <span>Monthly totals · UTC</span>
          </div>
        </section>
        <section className="panel pipeline-panel">
          <div className="panel-head">
            <div>
              <h2>Your pipeline</h2>
              <p>Every deal, a step closer</p>
            </div>
            <a className="icon-button" href="#deals" aria-label="Open deals">
              <Icon name="arrow-up-right" size={18} />
            </a>
          </div>
          <div className="pipeline-total">
            <strong>{compactMoney(totalValue)}</strong>
            <span>Open pipeline value</span>
          </div>
          <div className="pipeline">
            {d.pipeline.map((s, i) => (
              <div className="stage-row" key={s.id || s.name}>
                <div className="stage-info">
                  <span>
                    <i
                      style={{
                        background: [
                          "#167c66",
                          "#5aa58f",
                          "#97c2b4",
                          "#e8ba7b",
                          "#8394b5",
                        ][i % 5],
                      }}
                    />
                    {s.name}
                    <small>{s.count} deals</small>
                  </span>
                  <strong>{compactMoney(s.value)}</strong>
                </div>
                <div className="track">
                  <span
                    style={{
                      width:
                        (pipelineTotal ? (s.count / pipelineTotal) * 100 : 0) +
                        "%",
                      background: [
                        "#167c66",
                        "#5aa58f",
                        "#97c2b4",
                        "#e8ba7b",
                        "#8394b5",
                      ][i % 5],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <a className="panel-link" href="#deals">
            Explore your deals
            <Icon name="arrow-right" size={17} />
          </a>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>On your list today</h2>
              <p>
                {dateLabel(today())} · {d.dueCount} pending
              </p>
            </div>
            <span className="pill">{d.dueCount} tasks</span>
          </div>
          <div className="tasks-list">
            {d.dueTasks.length ? (
              d.dueTasks.map((t) => (
                <label className="task-row" key={t.id}>
                  <input
                    type="checkbox"
                    checked={busy === t.id}
                    disabled={Boolean(busy)}
                    onChange={() => complete(t.id)}
                    aria-label={"Complete " + t.title}
                  />
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {t.contact?.name || t.deal?.title || "General task"}
                    </small>
                  </span>
                  <span className="badge amber">Today</span>
                </label>
              ))
            ) : (
              <Empty
                title="You’re all caught up"
                description="Add a task when there’s a next step to take."
              />
            )}
          </div>
          <a className="panel-link" href="#tasks">
            View all tasks{d.dueCount > 8 ? " · Showing first 8" : ""}
            <Icon name="arrow-right" size={17} />
          </a>
        </section>
        <section className="panel quick-panel">
          <div className="panel-head">
            <div>
              <h2>Make your next move</h2>
              <p>Good relationships begin with small actions.</p>
            </div>
          </div>
          <div className="quick-grid">
            {[
              [
                "contacts",
                "Add a contact",
                "Start a new relationship",
                "contacts",
                "mint",
              ],
              [
                "deals",
                "Create a deal",
                "Turn a conversation into an opportunity",
                "deals",
                "blue",
              ],
              [
                "tasks",
                "Plan a task",
                "Give your next step a place",
                "tasks",
                "peach",
              ],
            ].map(([type, title, desc, icon, color]) => (
              <button className="quick" key={type} onClick={() => onNew(type)}>
                <span className={"quick-icon " + color}>
                  <Icon name={icon} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
                <Icon name="arrow-up-right" size={17} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Records({ type, user, members, stages, onEdit, notify }) {
  const [filters, setFilters] = useState({}),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState("");
  const { data, error, retry, update } = useData(
    "/" + type + "?" + new URLSearchParams({ ...filters, page }),
  );
  async function change(item, body) {
    setBusy(item.id);
    update((previous) => ({
      ...previous,
      items: previous.items.map((row) =>
        row.id === item.id ? { ...row, ...body } : row,
      ),
    }));
    try {
      await api("/" + type + "/" + item.id, "PATCH", body);
      notify("Saved successfully.");
      retry();
    } catch (e) {
      update(
        (previous) =>
          previous && {
            ...previous,
            items: previous.items.map((row) =>
              row.id === item.id ? item : row,
            ),
          },
      );
      notify(e.message, true);
    } finally {
      setBusy("");
    }
  }
  async function remove(item) {
    if (
      !window.confirm(
        "Move this record to the recycle bin? You can restore it later. Unlink or remove linked records first.",
      )
    )
      return;
    setBusy(item.id);
    try {
      await api("/" + type + "/" + item.id, "DELETE");
      notify("Record moved to the recycle bin.");
      retry();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy("");
    }
  }
  const names =
    type === "contacts"
      ? ["Contact", "Company", "Phone", "Assigned to", "Added"]
      : type === "deals"
        ? ["Deal", "Contact", "Value", "Stage", "Expected close"]
        : ["Task", "Linked record", "Assigned to", "Due date", "Status"];
  return (
    <section className="panel records-panel">
      <form
        className="filters"
        key={JSON.stringify(filters)}
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(Object.fromEntries(new FormData(e.currentTarget)));
          setPage(1);
        }}
      >
        <label className="filter-search">
          Search
          <div className="input-icon">
            <Icon name="search" size={17} />
            <input
              name="q"
              defaultValue={filters.q || ""}
              placeholder={
                type === "contacts" ? "Name, email or phone" : "Search " + type
              }
            />
          </div>
        </label>
        {type === "contacts" && (
          <>
            <label>
              Company
              <input
                name="company"
                defaultValue={filters.company || ""}
                placeholder="Any company"
              />
            </label>
            <label>
              Added from
              <input
                type="date"
                name="from"
                defaultValue={filters.from || ""}
              />
            </label>
            <label>
              Added through
              <input type="date" name="to" defaultValue={filters.to || ""} />
            </label>
          </>
        )}
        {type === "deals" && (
          <label>
            Pipeline stage
            <select name="stageId" defaultValue={filters.stageId || ""}>
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === "tasks" && (
          <label>
            Status
            <select name="completed" defaultValue={filters.completed || ""}>
              <option value="">All tasks</option>
              <option value="false">Pending</option>
              <option value="true">Completed</option>
            </select>
          </label>
        )}
        <label>
          Sort by
          <select name="sort" defaultValue={filters.sort || "createdAt"}>
            <option value="createdAt">Date added</option>
            {(type === "contacts"
              ? [
                  ["name", "Name"],
                  ["company", "Company"],
                ]
              : type === "deals"
                ? [
                    ["value", "Value"],
                    ["expectedCloseDate", "Close date"],
                  ]
                : [["dueDate", "Due date"]]
            ).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Order
          <select name="direction" defaultValue={filters.direction || "desc"}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <button className="button" type="submit">
          <Icon name="filter" size={16} />
          Apply
        </button>
        {Object.keys(filters).length > 0 && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setFilters({});
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </form>
      {error ? (
        <DataError error={error} retry={retry} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="table-caption">
            <strong>{labels[type]}</strong>
            <span className="badge">{data.total} total</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[...names, "Actions"].map((n) => (
                    <th key={n} scope="col">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    {type === "contacts" ? (
                      <>
                        <td>
                          <div className="contact-cell">
                            <span className="contact-avatar">
                              {initials(item.name)}
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.email || "No email"}</small>
                            </span>
                          </div>
                        </td>
                        <td>{item.company || "—"}</td>
                        <td>{item.phone || "—"}</td>
                        <td>
                          {members.find((m) => m.id === item.assigneeId)
                            ?.name || "Unassigned"}
                        </td>
                        <td>{dateLabel(item.createdAt)}</td>
                      </>
                    ) : type === "deals" ? (
                      <>
                        <td>
                          <strong>{item.title}</strong>
                        </td>
                        <td>{item.contact?.name || "—"}</td>
                        <td className="money-cell">{money(item.value)}</td>
                        <td>
                          <select
                            className="stage-select"
                            value={item.stageId}
                            disabled={Boolean(busy)}
                            aria-label={"Stage for " + item.title}
                            onChange={(e) =>
                              change(item, { stageId: e.target.value })
                            }
                          >
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{dateLabel(item.expectedCloseDate)}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong
                            className={item.completed ? "completed-text" : ""}
                          >
                            {item.title}
                          </strong>
                        </td>
                        <td>{item.contact?.name || item.deal?.title || "—"}</td>
                        <td>
                          {members.find((m) => m.id === item.assigneeId)
                            ?.name || "Unassigned"}
                        </td>
                        <td>{dateLabel(item.dueDate)}</td>
                        <td>
                          <label className="check-line">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              disabled={Boolean(busy)}
                              aria-label={"Complete " + item.title}
                              onChange={(e) =>
                                change(item, { completed: e.target.checked })
                              }
                            />
                            <span
                              className={
                                "badge " + (item.completed ? "green" : "amber")
                              }
                            >
                              {item.completed ? "Complete" : "Pending"}
                            </span>
                          </label>
                        </td>
                      </>
                    )}
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={"Edit " + (item.name || item.title)}
                          title="Edit"
                          onClick={() => onEdit(type, item)}
                          disabled={Boolean(busy)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        {manager(user) && (
                          <button
                            className="icon-button danger"
                            aria-label={"Delete " + (item.name || item.title)}
                            title="Move to recycle bin"
                            onClick={() => remove(item)}
                            disabled={Boolean(busy)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <Empty
              title={"No " + type + " found"}
              description="Add your first record or try different filters."
            />
          )}
          <Pager data={data} onPage={setPage} />
        </>
      )}
    </section>
  );
}

function Editor({ editing, user, members, stages, onClose, onSaved }) {
  const { type, item } = editing;
  const [choices, setChoices] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([
      ["deals", "tasks"].includes(type) ? allChoices("contacts") : [],
      type === "tasks" ? allChoices("deals") : [],
    ])
      .then(([contacts, deals]) => {
        if (alive) setChoices({ contacts, deals });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [type]);
  const input = (name, label, props = {}) => (
    <label key={name}>
      {label}
      <input name={name} defaultValue={item[name] ?? ""} {...props} />
    </label>
  );
  const select = (name, label, options, props = {}) => (
    <label key={name}>
      {label}
      <select name={name} defaultValue={item[name] ?? ""} {...props}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  async function save(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    if (type === "contacts" && !manager(user))
      body.assigneeId = item.assigneeId || user.id;
    if (type === "tasks") {
      const [kind, id] = (body.link || "").split(":");
      body.contactId = kind === "contact" ? id : null;
      body.dealId = kind === "deal" ? id : null;
      body.completed = body.completed === "true";
      delete body.link;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        "/" + type + (item.id ? "/" + item.id : ""),
        item.id ? "PATCH" : "POST",
        body,
      );
      await onSaved(type);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    type === "members"
      ? "Create employee"
      : type === "member-passwords"
        ? "Reset member password"
        : (item.id ? "Edit " : "New ") +
          {
            contacts: "contact",
            deals: "deal",
            tasks: "task",
            stages: "pipeline stage",
            teams: "team",
          }[type];
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form onSubmit={save}>
        {!choices ? (
          <Loading />
        ) : (
          <>
            <div className="form-fields">
              {type === "contacts" && (
                <>
                  {input("name", "Full name", {
                    required: true,
                    maxLength: 120,
                    autoComplete: "name",
                  })}
                  {input("email", "Email", { type: "email", maxLength: 254 })}
                  {input("phone", "Phone", { type: "tel", maxLength: 30 })}
                  {input("company", "Company", { maxLength: 120 })}
                  {select(
                    "assigneeId",
                    "Assigned to",
                    [
                      ["", user.role === "ADMIN" ? "Unassigned" : "Myself"],
                      ...members
                        .filter((m) => m.active || m.id === item.assigneeId)
                        .map((m) => [m.id, m.name]),
                    ],
                    { disabled: !manager(user) },
                  )}
                </>
              )}
              {type === "deals" && (
                <>
                  {input("title", "Deal title", {
                    required: true,
                    maxLength: 160,
                  })}
                  {select(
                    "contactId",
                    "Contact",
                    choices.contacts.map((c) => [c.id, c.name]),
                    {
                      required: true,
                      defaultValue: item.contactId || choices.contacts[0]?.id,
                    },
                  )}
                  {select(
                    "stageId",
                    "Pipeline stage",
                    stages.map((s) => [s.id, s.name]),
                    {
                      required: true,
                      defaultValue: item.stageId || stages[0]?.id,
                    },
                  )}
                  {input("value", "Value (₹)", {
                    type: "number",
                    required: true,
                    min: 0,
                    max: 999999999999.99,
                    step: ".01",
                    defaultValue: item.value ?? 0,
                  })}
                  {input("expectedCloseDate", "Expected close date", {
                    type: "date",
                    defaultValue: item.expectedCloseDate?.slice(0, 10) || "",
                  })}
                  {!choices.contacts.length && (
                    <p className="form-error">
                      Add a contact first. Every deal belongs to someone.
                    </p>
                  )}
                  {!stages.length && (
                    <p className="form-error">
                      Ask an administrator to add a pipeline stage.
                    </p>
                  )}
                </>
              )}
              {type === "tasks" && (
                <>
                  {input("title", "Task title", {
                    required: true,
                    maxLength: 160,
                  })}
                  {input("dueDate", "Due date", {
                    type: "date",
                    defaultValue: item.dueDate?.slice(0, 10) || "",
                  })}
                  {select(
                    "link",
                    "Linked record",
                    [
                      ["", "No linked record"],
                      ...choices.contacts.map((c) => [
                        "contact:" + c.id,
                        "Contact · " + c.name,
                      ]),
                      ...choices.deals.map((d) => [
                        "deal:" + d.id,
                        "Deal · " + d.title,
                      ]),
                    ],
                    {
                      defaultValue: item.contactId
                        ? "contact:" + item.contactId
                        : item.dealId
                          ? "deal:" + item.dealId
                          : "",
                    },
                  )}
                  {select(
                    "completed",
                    "Status",
                    [
                      ["false", "Pending"],
                      ["true", "Complete"],
                    ],
                    { defaultValue: String(item.completed || false) },
                  )}
                  {manager(user) &&
                    select(
                      "assigneeId",
                      "Assigned to",
                      members
                        .filter((m) => m.active || m.id === item.assigneeId)
                        .map((m) => [m.id, m.name]),
                      {
                        required: true,
                        defaultValue: item.assigneeId || user.id,
                      },
                    )}
                </>
              )}
              {type === "stages" && (
                <>
                  {input("name", "Stage name", {
                    required: true,
                    maxLength: 60,
                  })}
                  {select(
                    "kind",
                    "Outcome type",
                    [
                      ["OPEN", "Open"],
                      ["WON", "Won"],
                      ["LOST", "Lost"],
                    ],
                    {
                      disabled: Boolean(item.id),
                      defaultValue: item.kind || "OPEN",
                    },
                  )}
                  {input("position", "Display position", {
                    type: "number",
                    required: true,
                    min: 0,
                    max: 999,
                    step: 1,
                    defaultValue: item.position ?? stages.length,
                  })}
                  <p className="form-hint">
                    Outcome types stay fixed. A stage in use cannot be deleted.
                  </p>
                </>
              )}
              {type === "teams" && (
                <>
                  {input("name", "Team name", {
                    required: true,
                    maxLength: 80,
                  })}
                  {select(
                    "leaderId",
                    "Team leader",
                    [
                      ["", "Choose a leader"],
                      ...members
                        .filter(
                          (m) =>
                            m.active &&
                            m.role !== "ADMIN" &&
                            (!m.teamId || m.teamId === item.id),
                        )
                        .map((m) => [m.id, m.name]),
                    ],
                    { required: true },
                  )}
                  <p className="form-hint">
                    The selected person becomes the team’s sub-admin. Replacing
                    a leader returns the previous leader to the employee role.
                  </p>
                </>
              )}
              {type === "members" && (
                <>
                  {input("name", "Full name", {
                    required: true,
                    maxLength: 20,
                  })}
                  {input("email", "Email", {
                    type: "email",
                    required: true,
                    maxLength: 254,
                  })}
                  {input("phone", "Phone (10 digits)", {
                    type: "tel",
                    required: true,
                    pattern: "[0-9]{10}",
                    maxLength: 10,
                  })}
                  {select(
                    "role",
                    "Role",
                    [
                      ["EMPLOYEE", "Employee"],
                      ["SUB_ADMIN", "Sub-admin"],
                      ["ADMIN", "Admin"],
                    ],
                    { defaultValue: "EMPLOYEE" },
                  )}
                </>
              )}
              {["members", "member-passwords"].includes(type) && (
                <>
                  {type === "member-passwords" && (
                    <p className="form-hint">
                      Set a new password for <strong>{item.name}</strong>. Their
                      existing sessions will be signed out.
                    </p>
                  )}
                  <label>
                    {type === "members" ? "Initial password" : "New password"}
                    <div className="password-input">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={12}
                        autoComplete="new-password"
                      />
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        onClick={() => setShowPassword((x) => !x)}
                      >
                        <Icon
                          name={showPassword ? "eye-off" : "eye"}
                          size={18}
                        />
                      </button>
                    </div>
                  </label>
                  <p className="form-hint">
                    Use at least 12 characters. Share the password privately;
                    the member can change it from their profile.
                  </p>
                </>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={
              busy ||
              !choices ||
              (type === "deals" && (!choices.contacts.length || !stages.length))
            }
          >
            {busy
              ? "Saving…"
              : type === "members"
                ? "Create employee"
                : "Save changes"}
            <Icon name="check" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WorkspaceSearch({ onEdit, notify }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState(null),
    [opened, setOpened] = useState(false),
    [error, setError] = useState("");
  const ref = useRef(null),
    input = useRef(null);
  useEffect(() => {
    let active = true;
    setResults(null);
    setError("");
    if (query.trim().length < 2) return;
    const timer = setTimeout(
      () =>
        api("/search?q=" + encodeURIComponent(query.trim()))
          .then((data) => {
            if (active) setResults(data);
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpened(false);
    };
    const key = (e) => {
      if (e.key === "Escape") setOpened(false);
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      ) {
        e.preventDefault();
        input.current.focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  async function choose(type, item) {
    setOpened(false);
    try {
      onEdit(type, await api("/" + type + "/" + item.id));
    } catch (e) {
      notify(e.message, true);
    }
  }
  return (
    <div className="search-wrap" ref={ref}>
      <label className="search-box">
        <Icon name="search" size={19} />
        <input
          ref={input}
          type="search"
          placeholder="Search your workspace…"
          aria-label="Search contacts, deals and tasks"
          value={query}
          onFocus={() => setOpened(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpened(true);
          }}
        />
        <kbd>/</kbd>
      </label>
      {opened && query.trim().length >= 2 && (
        <div className="search-results" aria-live="polite">
          {error ? (
            <p>{error}</p>
          ) : !results ? (
            <p>Searching…</p>
          ) : Object.values(results).every((items) => !items.length) ? (
            <p>No matching records.</p>
          ) : (
            Object.entries(results).map(
              ([type, items]) =>
                items.length > 0 && (
                  <div key={type}>
                    <h3>{type} · up to 10 matches</h3>
                    {items.map((item) => (
                      <button key={item.id} onClick={() => choose(type, item)}>
                        <Icon name={type} size={17} />
                        <span>{item.name || item.title}</span>
                        <Icon name="arrow-up-right" size={14} />
                      </button>
                    ))}
                  </div>
                ),
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [identity, setIdentity] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [view, setView] = useState(location.hash.slice(1) || "overview"),
    [mobile, setMobile] = useState(false),
    [mode, setMode] = useState(
      localStorage.getItem("vb-theme") ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    ),
    [notice, setNotice] = useState(null),
    [editing, setEditing] = useState(null),
    [revision, setRevision] = useState(0),
    [refreshing, setRefreshing] = useState(false);
  const identityRef = useRef(null),
    loadVersion = useRef(0);
  const notify = useCallback(
    (message, error = false) => setNotice({ message, error }),
    [],
  );
  const reloadMetadata = useCallback(async () => {
    const version = ++loadVersion.current;
    const user = await api("/me");
    const [stages, members, teams] = await Promise.all([
      api("/stages"),
      api("/members"),
      manager(user) ? api("/teams") : [],
    ]);
    if (version !== loadVersion.current) return;
    const previous = identityRef.current;
    if (
      previous &&
      (previous.user.role !== user.role || previous.user.teamId !== user.teamId)
    )
      setEditing(null);
    identityRef.current = { user, stages, members, teams };
    setIdentity(identityRef.current);
  }, []);
  useEffect(() => {
    reloadMetadata().catch((e) => setError(e.message));
  }, [attempt, reloadMetadata]);
  useEffect(() => {
    if (identity) reloadMetadata().catch((e) => notify(e.message, true));
  }, [view]);
  useLayoutEffect(() => {
    syncTheme(mode);
  }, [mode]);
  useEffect(() => {
    const navigate = () => {
      setView(location.hash.slice(1) || "overview");
      setMobile(false);
      setNotice(null);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const key = (e) => {
      if (e.key === "Escape") setMobile(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [mobile]);
  const allowed = identity
    ? [
        "overview",
        "contacts",
        "deals",
        "tasks",
        "documents",
        "attendance",
        "profile",
        ...(manager(identity.user) ? ["settings", "teams", "recycle-bin"] : []),
        ...(identity.user.role === "ADMIN" ? ["activity"] : []),
      ]
    : ["overview"];
  const current = allowed.includes(view) ? view : "overview";
  useEffect(() => {
    document.title = labels[current] + " — Virtual Binz";
  }, [current]);
  const closeEditor = useCallback(() => setEditing(null), []);
  const onNew = (type) => setEditing({ type, item: {} }),
    onEdit = (type, item) => setEditing({ type, item });
  async function refresh() {
    setRefreshing(true);
    try {
      await reloadMetadata();
      setRevision((x) => x + 1);
      setNotice(null);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setRefreshing(false);
    }
  }
  async function saved(type) {
    setEditing(null);
    notify(
      type === "members"
        ? "Employee account created. Share the login details privately."
        : type === "member-passwords"
          ? "Password reset. Share the new password privately."
          : "Saved successfully.",
    );
    setRevision((x) => x + 1);
    try {
      await reloadMetadata();
    } catch (error) {
      notify(
        "Your change was saved, but workspace details could not refresh. " +
          error.message,
        true,
      );
    }
  }
  async function logout() {
    try {
      await window.crmSession.logout();
    } catch (e) {
      notify(e.message, true);
    }
  }
  if (!identity)
    return (
      <div className="startup">
        <Brand />
        {error ? (
          <Empty title="Could not open your workspace" description={error}>
            <button
              className="button primary"
              onClick={() => {
                setError("");
                setAttempt((x) => x + 1);
              }}
            >
              Try again
            </button>
          </Empty>
        ) : (
          <Loading />
        )}
      </div>
    );
  const { user, members, stages, teams } = identity;
  const shared = {
    user,
    api,
    notify,
    members,
    stages,
    teams,
    onNew,
    onEdit,
    reloadMetadata,
  };
  const settingsActive = [
    "settings",
    "teams",
    "activity",
    "recycle-bin",
  ].includes(current);
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="app">
        {mobile && (
          <button
            className="sidebar-overlay"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={"sidebar " + (mobile ? "open" : "")} id="sidebar">
          <div className="sidebar-brand">
            <Brand />
            <button
              className="icon-button mobile sidebar-close"
              onClick={() => setMobile(false)}
              aria-label="Close menu"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="workspace">
            <span className="workspace-icon">
              {initials(user.orgId).slice(0, 1)}
            </span>
            <span>
              <strong>{user.orgId}</strong>
              <small>Team workspace</small>
            </span>
            <Icon name="chevron-down" size={16} />
          </div>
          <p className="nav-label">WORKSPACE</p>
          <nav aria-label="Main navigation">
            {[
              ["overview", "overview"],
              ["contacts", "contacts"],
              ["deals", "deals"],
              ["tasks", "tasks"],
              ["documents", "file"],
              ["attendance", "clock"],
            ].map(([name, icon]) => (
              <a
                key={name}
                data-view={name}
                href={"#" + name}
                className={current === name ? "active" : ""}
                aria-current={current === name ? "page" : undefined}
              >
                <Icon name={icon} size={19} />
                <span>{labels[name]}</span>
                {current === name && <i className="nav-active-dot" />}
              </a>
            ))}
          </nav>
          {manager(user) && (
            <>
              <p className="nav-label manage-label">MANAGE</p>
              <nav aria-label="Team navigation">
                <a
                  href="#settings"
                  className={settingsActive ? "active" : ""}
                  aria-current={settingsActive ? "page" : undefined}
                >
                  <Icon name="settings" size={19} />
                  <span>Team & settings</span>
                  {settingsActive && <i className="nav-active-dot" />}
                </a>
              </nav>
            </>
          )}
          <div className="sidebar-bottom">
            <div className="workspace-note">
              <span className="note-symbol">
                <Icon name="chart" size={24} />
              </span>
              <strong>A little progress, every day.</strong>
              <p>
                Good people. Clear next steps.
                <br />
                Stronger relationships.
              </p>
              <a href="#tasks">
                Find your next step
                <Icon name="arrow-right" size={15} />
              </a>
            </div>
            <div className="profile">
              <a
                href="#profile"
                className="avatar"
                aria-label="Open your profile"
              >
                {initials(user.name)}
              </a>
              <a href="#profile" className="profile-name">
                <strong>{user.name}</strong>
                <small>{roleLabel(user.role)}</small>
              </a>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
              >
                <Icon name="logout" size={18} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile"
              onClick={() => setMobile((x) => !x)}
              aria-label="Toggle menu"
              aria-expanded={mobile}
              aria-controls="sidebar"
            >
              <Icon name="menu" />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <Icon name="chevron-right" size={13} />
              <strong>{labels[current]}</strong>
            </div>
            <div className="topbar-right">
              <WorkspaceSearch onEdit={onEdit} notify={notify} />
              <span className="header-divider" />
              <button
                className="icon-button theme-button"
                aria-label={
                  "Switch to " + (mode === "light" ? "dark" : "light") + " mode"
                }
                onClick={(event) => toggleTheme(event, setMode)}
              >
                <Icon name={mode === "light" ? "moon" : "sun"} size={19} />
              </button>
              <a
                className="header-avatar"
                href="#profile"
                aria-label="Open your profile"
              >
                {initials(user.name)}
              </a>
            </div>
          </header>
          <main id="main" tabIndex="-1">
            {notice && (
              <div
                className={"notice " + (notice.error ? "error" : "")}
                role={notice.error ? "alert" : "status"}
              >
                <Icon name={notice.error ? "help" : "check"} size={18} />
                <span>{notice.message}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss message"
                  onClick={() => setNotice(null)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            <section className="page-heading">
              <div>
                <div className="heading-context">
                  <p className="eyebrow">
                    {current === "overview"
                      ? "YOUR WORKSPACE AT A GLANCE"
                      : "YOUR SHARED WORKSPACE"}
                  </p>
                  {current === "overview" && (
                    <time className="workspace-date" dateTime={today()}>
                      <Icon name="clock" size={12} />
                      {new Date().toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  )}
                </div>
                <h1>
                  {current === "overview"
                    ? "Hello, " + user.name.split(" ")[0] + "."
                    : labels[current]}
                  {current === "overview" && (
                    <span className="greeting-spark">✦</span>
                  )}
                </h1>
                <p className="subtitle">{subtitles[current]}</p>
              </div>
              <div className="heading-actions">
                <button
                  className="button"
                  onClick={refresh}
                  disabled={refreshing}
                >
                  <Icon name="refresh" size={16} />
                  <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
                </button>
                {["overview", "contacts", "deals", "tasks"].includes(
                  current,
                ) && (
                  <button
                    className="button primary"
                    onClick={() =>
                      onNew(current === "overview" ? "deals" : current)
                    }
                  >
                    <Icon name="plus" size={17} />
                    {current === "contacts"
                      ? "Add contact"
                      : current === "tasks"
                        ? "Add task"
                        : "New deal"}
                  </button>
                )}
              </div>
            </section>
            <div
              id="content"
              className="workspace-view"
              key={current + revision + user.role + (user.teamId || "")}
            >
              {current === "overview" ? (
                <Overview onNew={onNew} notify={notify} />
              ) : ["contacts", "deals", "tasks"].includes(current) ? (
                <Records type={current} {...shared} />
              ) : current === "documents" ? (
                <Documents {...shared} />
              ) : current === "attendance" ? (
                <Attendance {...shared} />
              ) : current === "profile" ? (
                <Profile {...shared} onLogout={logout} />
              ) : current === "settings" ? (
                <Settings {...shared} />
              ) : current === "teams" ? (
                <Teams {...shared} />
              ) : (
                <History type={current} {...shared} />
              )}
            </div>
            <footer className="page-footer">
              <span>
                <span className="online-dot" />
                Your relationship workspace
              </span>
              <span>
                Virtual Binz CRM <span className="footer-dot">·</span> Built for
                better relationships
              </span>
            </footer>
          </main>
        </div>
      </div>
      {editing && (
        <Editor
          editing={editing}
          {...shared}
          onClose={closeEditor}
          onSaved={saved}
        />
      )}
    </>
  );
}
