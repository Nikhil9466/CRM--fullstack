import { flushSync } from "react-dom";
import "./theme-transition.css";

let pendingRequest = null;
let requestedTheme = null;
let running = false;
const duration = 1000;

export function syncTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("vb-theme", theme);
}

function prefersReducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateIcon(button) {
  const icon = button?.querySelector("svg");
  if (!icon?.animate) return;
  return icon.animate(
    [
      { transform: "rotate(-90deg) scale(.9)", opacity: 0.65 },
      { transform: "rotate(0deg) scale(1)", opacity: 1 },
    ],
    { duration, easing: "linear" },
  );
}

async function revealTheme({ x, y, button, setTheme, theme }) {
  const root = document.documentElement;
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    // Layout effects synchronize the theme inside this commit, before the new snapshot.
    flushSync(() => setTheme(theme));
  };

  if (prefersReducedMotion()) {
    commit();
    return;
  }

  if (!document.startViewTransition) {
    let animation;
    try {
      root.classList.add("theme-fading");
      // Paint the old colors with their temporary transition before changing theme.
      void root.offsetWidth;
      commit();
      animation = animateIcon(button);
      await Promise.allSettled([
        new Promise((resolve) => setTimeout(resolve, duration)),
        animation?.finished,
      ]);
    } finally {
      animation?.cancel();
      root.classList.remove("theme-fading");
    }
    return;
  }

  const previousName = button?.style.viewTransitionName;
  if (button?.isConnected) button.style.viewTransitionName = "theme-switch";
  root.classList.add("theme-revealing");
  let transition;
  let animation;
  try {
    transition = document.startViewTransition(commit);
    transition.updateCallbackDone.catch(() => {});
    transition.finished.catch(() => {});
    // A skipped transition may reject ready, while finished still resolves.
    await transition.ready;
    const radius =
      Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 4;
    animation = root.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration,
        // A steady radius uses the whole second instead of leaving a still tail.
        easing: "linear",
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      },
    );
    await animation.finished;
    // Release the filled effect before waiting for the snapshot tree to disappear.
    // Otherwise it can survive this transition and affect later snapshots.
    animation.cancel();
    await transition.finished;
  } catch {
    // Browsers can skip snapshots while hidden or under resource pressure.
    transition?.skipTransition();
    commit();
  } finally {
    animation?.cancel();
    transition?.skipTransition();
    root.classList.remove("theme-revealing");
    if (button) button.style.viewTransitionName = previousName || "";
  }
}

async function processRequests() {
  if (running) return;
  running = true;
  try {
    while (pendingRequest) {
      const request = pendingRequest;
      pendingRequest = null;
      if (
        !request.button.isConnected ||
        document.documentElement.dataset.theme === request.theme
      ) continue;
      try {
        await revealTheme(request);
      } catch {
        // Keep later clicks usable if an optional animation API fails.
        document.documentElement.classList.remove(
          "theme-fading",
          "theme-revealing",
        );
      }
    }
  } finally {
    running = false;
    requestedTheme = null;
  }
}

export function toggleTheme(event, setTheme) {
  const button = event.currentTarget;
  const bounds = button.getBoundingClientRect();
  const pointer = event.detail > 0;
  const previousTheme = requestedTheme || document.documentElement.dataset.theme;
  requestedTheme = previousTheme === "dark" ? "light" : "dark";
  pendingRequest = {
    button,
    setTheme,
    theme: requestedTheme,
    x: pointer ? event.clientX : bounds.left + bounds.width / 2,
    y: pointer ? event.clientY : bounds.top + bounds.height / 2,
  };
  // Keep the latest intended theme instead of building a queue of old animations.
  // Rapid taps preserve their final toggle parity with at most one pending reveal.
  void processRequests();
}
