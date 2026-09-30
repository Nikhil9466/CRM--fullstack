import React, { useEffect, useRef } from "react";

const paths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  contacts:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87",
  deals: "M3 7h18v14H3zM8 7V3h8v4M3 12h18M10 12v3h4v-3",
  tasks: "M9 11l3 3L22 4M21 12v8H3V3h13",
  file: "M14 2H6v20h12V6zM14 2v5h5M9 12h6M9 16h6",
  clock: "M12 8v4l3 2",
  settings:
    "M12 2l2 3 4-1 2 4-3 3 3 3-2 4-4-1-2 3-2-3-4 1-2-4 3-3-3-3 2-4 4 1z",
  search: "M21 21l-5-5",
  plus: "M12 5v14M5 12h14",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-up-right": "M7 17 17 7M7 7h10v10",
  "arrow-left": "M19 12H5M11 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-down": "M6 9l6 6 6-6",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M19 16a8 8 0 0 1-13 3l-2-2",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1",
  moon: "M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M6 18 18 6",
  logout: "M9 4H3v16h6M9 12h12M16 7l5 5-5 5",
  check: "M5 12l4 4L19 6",
  shield: "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6",
  mail: "M3 5h18v14H3zM3 5l9 7 9-7",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z",
  "eye-off":
    "M3 3l18 18M10 5c7-2 12 7 12 7s-2 4-6 6M6 6c-3 2-4 6-4 6s4 7 10 7l3-1",
  upload: "M12 16V3M7 8l5-5 5 5M4 16v5h16v-5",
  download: "M12 3v13M7 11l5 5 5-5M4 17v4h16v-4",
  coffee:
    "M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 8h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3",
  play: "M7 4l14 8-14 8z",
  edit: "M16 3l5 5L8 21H3v-5zM13 6l5 5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  filter: "M3 4h18l-7 8v7l-4 2V12z",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  help: "M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 17h.01",
  wallet: "M3 5h17v15H3zM3 5V3h15M15 10h6v5h-6z",
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.file} />
      {["users", "contacts"].includes(name) && <circle cx="9" cy="7" r="4" />}
      {["clock", "sun", "search", "settings", "help"].includes(name) && (
        <circle
          cx={name === "search" ? 10.5 : 12}
          cy={name === "search" ? 10.5 : 12}
          r={
            name === "clock" || name === "help"
              ? 9
              : name === "search"
                ? 7.5
                : name === "settings"
                  ? 3
                  : 4
          }
        />
      )}
      {name === "eye" && <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
export function Brand() {
  return (
    <a href="/home.html" className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 30 30" aria-hidden="true">
          <path
            d="m5 8 7 14 7-14M16 8l5 10 5-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>
        Virtual Binz<small>RELATIONSHIPS, SIMPLIFIED</small>
      </span>
    </a>
  );
}
export function Panel({ children, ...props }) {
  return (
    <section {...props} className={"panel " + (props.className || "")}>
      {children}
    </section>
  );
}
export function Empty({ title = "Nothing here yet", description, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="file" size={24} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-grid" aria-label="Loading workspace" role="status">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function Pager({ data, onPage }) {
  const pages =
    data.pages || Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="pager">
      <span>
        {data.total} records{" "}
        <span className="muted">
          · Page {data.page} of {pages}
        </span>
      </span>
      <div>
        <button
          className="button small"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          <Icon name="chevron-left" size={16} />
          Previous
        </button>
        <button
          className="button small"
          disabled={data.page >= pages}
          onClick={() => onPage(data.page + 1)}
        >
          Next
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </div>
  );
}
export function Modal({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    const cancel = (e) => {
      e.preventDefault();
      if (!busy) onClose();
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [onClose, busy]);
  return (
    <dialog
      ref={ref}
      className="editor-dialog"
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
