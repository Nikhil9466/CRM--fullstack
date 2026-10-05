import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import Mascot from "./Mascot.jsx";
import { syncTheme, toggleTheme } from "./theme-transition.js";
import "./auth.css";
import "./auth-polish.css";

const modes = {
  login: {
    eyebrow: "YOUR WORKSPACE, READY WHEN YOU ARE",
    title: "Welcome back.",
    description: "A little more organised. A lot more connected.",
    button: "Sign in to your workspace",
  },
  signup: {
    eyebrow: "MAKE ROOM FOR GREAT RELATIONSHIPS",
    title: "Start something good.",
    description: "Create your organisation and bring your team together.",
    button: "Create workspace",
  },
  password: {
    eyebrow: "ACCOUNT SETTINGS",
    title: "A fresh password.",
    description: "Keep your account protected with a password only you know.",
    button: "Update password",
  },
  forgot: {
    eyebrow: "LET’S GET YOU BACK IN",
    title: "Need a hand?",
    description: "Your administrator can help you access your workspace again.",
  },
  reset: {
    eyebrow: "PASSWORD RECOVERY",
    title: "Let’s find another way.",
    description: "Password reset links are not enabled for this workspace.",
  },
};

function getMode() {
  const page = window.location.pathname.split("/").pop();
  return (
    {
      "signup.html": "signup",
      "account.html": "password",
      "forgot-password.html": "forgot",
      "reset-password.html": "reset",
    }[page] || "login"
  );
}

function Brand() {
  return (
    <a
      href="login.html"
      className="auth-brand"
      aria-label="Virtual Binz sign in"
    >
      <span className="auth-brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 30 30">
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
        Virtual Binz
        <span className="auth-brand-caption">RELATIONSHIPS, IN GOOD HANDS</span>
      </span>
    </a>
  );
}

function BrandPanel({ mood }) {
  return (
    <aside className="auth-brand-panel">
      <Brand />
      <div className="auth-brand-story">
        <span className="auth-story-tag">
          <span /> YOUR TEAM’S EVERYDAY WORKSPACE
        </span>
        <h2>
          Big plans.
          <br />
          Better together.
        </h2>
        <p>
          Keep your people, conversations, and next steps beautifully connected.
        </p>
        <Mascot mood={mood} />
        <div className="auth-story-bottom">
          <span>People.</span>
          <span>Plans.</span>
          <span>Possibilities.</span>
        </div>
      </div>
      <div className="auth-brand-footer">
        <Icon name="shield" size={17} />
        <span>One secure workspace. A more connected team.</span>
      </div>
    </aside>
  );
}

function Field({
  label,
  icon,
  name,
  value,
  onChange,
  password = false,
  hint,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const [valid, setValid] = useState(false);
  const input = useRef(null);
  const id = `auth-${name}`;
  useEffect(() => {
    setValid(Boolean(value) && input.current.validity.valid);
  }, [value]);
  return (
    <div
      className={`auth-field${valid ? " auth-field-ready" : ""}${touched && !valid ? " auth-field-incomplete" : ""}`}
    >
      <label htmlFor={id}>
        {label}
        {valid && (
          <span className="auth-field-check" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
        )}
      </label>
      <div className={`auth-input-wrap${icon ? " auth-input-with-icon" : ""}`}>
        {icon && <Icon name={icon} size={18} />}
        <input
          {...props}
          ref={input}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={() => setTouched(true)}
          onInvalid={() => {
            setTouched(true);
            setValid(false);
          }}
          aria-invalid={touched && !valid ? "true" : undefined}
          type={
            password ? (visible ? "text" : "password") : props.type || "text"
          }
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {password && (
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setVisible(!visible)}
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
          >
            <Icon name={visible ? "eye-off" : "eye"} size={19} />
          </button>
        )}
      </div>
      {hint && (
        <span className="auth-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

function PasswordHelp({ reset }) {
  return (
    <div className="auth-help-content">
      <div className="auth-help-icon">
        <Icon name="lock" size={28} />
      </div>
      <div className="auth-help-step">
        <span>1</span>
        <div>
          <h3>Contact your administrator</h3>
          <p>
            Ask them to open <strong>Team & settings</strong> and choose{" "}
            <strong>Reset password</strong> beside your account.
          </p>
        </div>
      </div>
      <div className="auth-help-step">
        <span>2</span>
        <div>
          <h3>Get your new password privately</h3>
          <p>
            Your administrator can set a new password and share it with you. If
            your account is inactive, they must also activate it.
          </p>
        </div>
      </div>
      <p className="auth-help-note">
        {reset ? "This server does not accept password-reset links. " : ""}If no
        administrator can sign in, contact the server operator. Changing your
        role does not change your password.
      </p>
      <a className="auth-submit" href="login.html">
        Back to sign in
        <Icon name="arrow-right" size={18} />
      </a>
      <p className="auth-secondary-link">
        <a href="account.html">I know my current password</a>
      </p>
    </div>
  );
}

export default function AuthApp() {
  const mode = getMode();
  const content = modes[mode];
  const [values, setValues] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    orgId: "",
    currentPassword: "",
    remember: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice] = useState(
    () => sessionStorage.getItem("crm-login-message") || "",
  );
  const [success, setSuccess] = useState("");
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem("vb-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const [fieldStatus, setFieldStatus] = useState({});
  const requiredFields =
    mode === "signup"
      ? ["name", "email", "phone", "orgId", "password"]
      : mode === "password"
        ? ["currentPassword", "password"]
        : ["email", "password"];
  const readyCount = requiredFields.filter(
    (name) => fieldStatus[name]?.valid,
  ).length;
  // Nova only receives a mood. Form values, including passwords, never reach the illustration.
  const mood = !["login", "signup", "password"].includes(mode)
    ? "help"
    : success
      ? "success"
      : busy
        ? "busy"
        : error
          ? "error"
          : readyCount === requiredFields.length
            ? "excited"
            : "happy";

  const noteField = (target, touched = false) => {
    if (target.tagName !== "INPUT" || target.type === "checkbox") return;
    const { name, value, validity } = target;
    setFieldStatus((previous) => ({
      ...previous,
      [name]: {
        valid: Boolean(value) && validity.valid,
        touched: touched || previous[name]?.touched || false,
      },
    }));
  };

  useEffect(() => {
    document.title = `${{ login: "Welcome back", signup: "Create workspace", password: "Change password", forgot: "Password help", reset: "Password recovery" }[mode]} — Virtual Binz`;
    if (notice) sessionStorage.removeItem("crm-login-message");
  }, [mode, notice]);
  useLayoutEffect(() => {
    syncTheme(theme);
  }, [theme]);

  const update = (event) => {
    const { name, value, checked, type } = event.target;
    setValues((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
    noteField(event.target);
    setError("");
    setSuccess("");
  };

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    if (
      mode !== "login" &&
      new TextEncoder().encode(values.password).length > 72
    ) {
      setError(
        "Your new password must be at least 12 characters and at most 72 UTF-8 bytes.",
      );
      return;
    }
    setBusy(true);
    try {
      const body =
        mode === "password"
          ? {
              currentPassword: values.currentPassword,
              password: values.password,
            }
          : mode === "signup"
            ? {
                name: values.name,
                email: values.email,
                phone: values.phone,
                orgId: values.orgId,
                password: values.password,
                remember: false,
              }
            : {
                email: values.email,
                password: values.password,
                remember: values.remember,
              };
      const response = await window.crmSession.request(
        mode === "password" ? "/api/password" : `/api/auth/${mode}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
        mode === "password",
      );
      const data = await response.json().catch(() => ({
        error: "The server returned an unexpected response. Please retry.",
      }));
      if (!response.ok)
        throw new Error(data.error || "Please check your details.");
      if (mode === "password") {
        window.crmSession.signedOut();
        sessionStorage.setItem(
          "crm-login-message",
          "Password changed. Sign in with your new password.",
        );
        setSuccess("Password updated. Taking you back to sign in…");
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
          await new Promise((resolve) => setTimeout(resolve, 420));
        window.location.href = "login.html";
      } else {
        window.crmSession.signedIn(data);
        setSuccess(
          mode === "signup"
            ? "Your workspace is ready. Opening it now…"
            : "You’re signed in. Opening your workspace…",
        );
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
          await new Promise((resolve) => setTimeout(resolve, 420));
        window.location.href = "home.html";
      }
    } catch (err) {
      setError(
        err instanceof TypeError || err.name === "TimeoutError"
          ? "We couldn’t reach your workspace. Check your connection and make sure the CRM server is running, then try again."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }

  const isForm = ["login", "signup", "password"].includes(mode);
  return (
    <main className={`auth-layout auth-mode-${mode}`}>
      <BrandPanel mood={mood} />
      <section className="auth-form-panel">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-panel-top">
          {mode === "signup" ? (
            <>
              Already part of a team?{" "}
              <a href="login.html">
                Sign in
                <Icon name="arrow-right" size={15} />
              </a>
            </>
          ) : mode === "password" ? (
            <a href="home.html">
              Back to workspace
              <Icon name="arrow-right" size={15} />
            </a>
          ) : (
            <>
              New here?{" "}
              <a href="signup.html">
                Create a workspace
                <Icon name="arrow-right" size={15} />
              </a>
            </>
          )}
          <button
            className="auth-theme-toggle"
            type="button"
            onClick={(event) => toggleTheme(event, setTheme)}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          </button>
        </div>
        <div className="auth-form-content">
          <div className="auth-mobile-mascot">
            <Mascot mood={mood} compact />
          </div>
          <div className="auth-form-heading">
            <span className="auth-eyebrow">{content.eyebrow}</span>
            <h1>{content.title}</h1>
            <p>{content.description}</p>
          </div>
          {isForm ? (
            <form
              onSubmit={submit}
              onBlur={(event) => noteField(event.target, true)}
              onInvalid={(event) => noteField(event.target, true)}
              className="auth-form"
              aria-busy={busy}
            >
              <div
                className="auth-detail-progress"
                aria-label={`${readyCount} of ${requiredFields.length} details ready`}
              >
                <div aria-hidden="true">
                  {requiredFields.map((name, index) => (
                    <span
                      className={fieldStatus[name]?.valid ? "ready" : ""}
                      key={name}
                      style={{ "--step": index }}
                    />
                  ))}
                </div>
                <span>
                  {readyCount === requiredFields.length
                    ? "You're all set."
                    : "A few details, and you're on your way."}
                </span>
              </div>
              {mode === "signup" && (
                <Field
                  label="Your full name"
                  name="name"
                  value={values.name}
                  onChange={update}
                  required
                  maxLength={20}
                  autoComplete="name"
                  placeholder="Your name"
                />
              )}
              {mode !== "password" && (
                <Field
                  label="Email address"
                  icon="mail"
                  name="email"
                  value={values.email}
                  onChange={update}
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              )}
              {mode === "signup" && (
                <div className="auth-field-row">
                  <Field
                    label="Phone number"
                    name="phone"
                    value={values.phone}
                    onChange={update}
                    required
                    type="tel"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    autoComplete="tel-national"
                    inputMode="numeric"
                    placeholder="10-digit number"
                  />
                  <Field
                    label="Organisation ID"
                    name="orgId"
                    value={values.orgId}
                    onChange={update}
                    required
                    maxLength={80}
                    autoComplete="off"
                    placeholder="e.g. BINZ-STUDIO"
                  />
                </div>
              )}
              {mode === "password" && (
                <Field
                  label="Current password"
                  icon="lock"
                  name="currentPassword"
                  value={values.currentPassword}
                  onChange={update}
                  password
                  required
                  autoComplete="current-password"
                  placeholder="Your current password"
                />
              )}
              <Field
                label={mode === "login" ? "Password" : "New password"}
                icon="lock"
                name="password"
                value={values.password}
                onChange={update}
                password
                required
                minLength={mode === "login" ? undefined : 12}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder={
                  mode === "login"
                    ? "Enter your password"
                    : "Choose a strong password"
                }
                hint={
                  mode === "login"
                    ? undefined
                    : "Use at least 12 characters (up to 72 UTF-8 bytes)."
                }
              />
              {mode === "login" && (
                <div className="auth-form-options">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      name="remember"
                      checked={values.remember}
                      onChange={update}
                    />
                    <span>Keep me signed in</span>
                  </label>
                  <a href="forgot-password.html">Forgot password?</a>
                </div>
              )}
              {mode === "signup" && (
                <p className="auth-inline-note">
                  You’ll be the administrator of a new organisation. To join an
                  existing team, ask its admin to create your account.
                </p>
              )}
              {mode === "password" && (
                <p className="auth-inline-note">
                  You must be signed in to update your password. This signs out
                  all sessions.
                </p>
              )}
              {notice && (
                <div
                  className={`auth-message ${notice.startsWith("Password changed") ? "auth-message-success" : "auth-message-info"}`}
                  role="status"
                >
                  {notice}
                </div>
              )}
              {error && (
                <div className="auth-message auth-message-error" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div
                  className="auth-message auth-message-success"
                  role="status"
                >
                  {success}
                </div>
              )}
              <button className="auth-submit" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="auth-spinner" />
                    {mode === "login"
                      ? "Signing in…"
                      : mode === "signup"
                        ? "Creating workspace…"
                        : "Updating password…"}
                  </>
                ) : (
                  <>
                    {content.button}
                    <Icon name="arrow-right" size={19} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <PasswordHelp reset={mode === "reset"} />
          )}
          {mode === "login" && (
            <>
              <div className="auth-session-note">
                <Icon name="shield" size={17} />
                <p>
                  All tabs in this browser share one login. Changing your role
                  does not change your password.
                </p>
              </div>
              <p className="auth-secondary-link">
                <a href="account.html">Change your password</a>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p className="auth-secondary-link">
              Already have an account? <a href="login.html">Sign in</a>
            </p>
          )}
        </div>
        <footer className="auth-form-footer">
          <span>© {new Date().getFullYear()} Virtual Binz</span>
          <span>Built for better connections.</span>
        </footer>
      </section>
    </main>
  );
}
