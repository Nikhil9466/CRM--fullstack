import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import NovaArt from "./NovaArt.jsx";
import "./workspace-nova.css";

const WIDTH = 56;
const HEIGHT = 68;
const BREAK_MS = 120000;
const editable = "input, textarea, select, [contenteditable='true']";
const interactive = `${editable}, button, a, [role='button'], label`;

export default function WorkspaceNova({ userId, view, paused = false }) {
  const stage = useRef(null);
  const controller = useRef(null);
  const pause = useRef(paused);
  const environment = useRef({ view, paused });
  pause.current = paused;

  useEffect(() => {
    const pet = stage.current;
    const character = pet.querySelector(".wn-character");
    const announcement = pet.querySelector(".wn-announcement");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const storageKey = `crm:nova:hidden-until:${userId}`;
    const sleeps = new Map();
    let disposed = false, generation = 0, motion = null;
    let wakeTimer = 0, layoutTimer = 0, quietUntil = 0;
    let position = { x: 0, y: 0 }, anchor = 0;
    let hiddenUntil = 0, wasBlocked = false;
    let contentRoot = document.querySelector("#content > :first-child");
    try {
      const saved = Number(sessionStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > Date.now()) hiddenUntil = saved;
    } catch {}

    const transform = (point) => `translate3d(${point.x}px,${point.y}px,0)`;
    const main = () => document.getElementById("main");
    const blocked = () => pause.current || document.hidden ||
      Boolean(document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) ||
      Boolean(document.activeElement?.closest(editable));
    function bounds() {
      const box = main()?.getBoundingClientRect();
      const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
      const left = Math.max(6, box?.left + 6 || 6);
      const right = Math.max(left, Math.min(innerWidth - WIDTH - 6, (box?.right || innerWidth) - WIDTH - 6));
      const top = Math.min(innerHeight - HEIGHT - 6, Math.max(6, topbar?.bottom + 6 || 6));
      return { left, right, top: Math.max(6, top), bottom: Math.max(top, innerHeight - HEIGHT - 6) };
    }
    function clamp(point) {
      const box = bounds();
      return { x: Math.max(box.left, Math.min(box.right, point.x)), y: Math.max(box.top, Math.min(box.bottom, point.y)) };
    }
    function cards() {
      const box = bounds();
      return [...document.querySelectorAll("#content .kpi, #content .panel")]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 100 && rect.height > 65 && rect.top < innerHeight - 70 && rect.bottom > box.top + 60)
        .slice(0, 8);
    }
    function controls() {
      return [...(main()?.querySelectorAll(interactive) || [])]
        .filter((element) => element.getClientRects().length)
        .map((element) => element.getBoundingClientRect());
    }
    const overlaps = (point, rect) => point.x < rect.right && point.x + WIDTH > rect.left &&
      point.y < rect.bottom && point.y + HEIGHT > rect.top;
    function protectControls(point, obstacles = controls()) {
      const next = obstacles.some((rect) => overlaps(point, rect)) ? "none" : "";
      if (character.style.pointerEvents !== next) character.style.pointerEvents = next;
    }
    function perch(index = anchor, edge) {
      const list = cards();
      const card = list[Math.min(index, list.length - 1)];
      if (!card) {
        const box = bounds();
        return { x: box.right, y: box.bottom };
      }
      const y = edge === "bottom" ? card.bottom - 62 : card.top - 61;
      if (edge) return clamp({ x: card.right - 29, y });
      const obstacles = controls();
      // The real heading is tighter than the preview: keep resting poses off its text.
      main()?.querySelectorAll(".page-heading h1, .page-heading .subtitle, .page-heading .eyebrow")
        .forEach((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          obstacles.push(...range.getClientRects());
        });
      const order = [card, ...list.filter((item) => item !== card)];
      for (const candidate of order) {
        const choices = [0, 6, 12].flatMap((offset) =>
          [candidate.right - 77, candidate.left + 12, (candidate.left + candidate.right - WIDTH) / 2]
            .map((x) => clamp({ x, y: candidate.top - 61 + offset })));
        const safe = choices.find((point) => !obstacles.some((rect) => overlaps(point, rect)));
        if (safe) return safe;
      }
      const box = bounds();
      return { x: box.right, y: box.bottom };
    }
    function wait(ms) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => { sleeps.delete(timer); resolve(); }, ms);
        sleeps.set(timer, resolve);
      });
    }
    function stop() {
      generation++;
      if (motion) {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(pet).transform);
        position = { x: matrix.m41, y: matrix.m42 };
        pet.style.transform = transform(position);
        motion.cancel();
        motion = null;
      }
      for (const [timer, resolve] of sleeps) { clearTimeout(timer); resolve(); }
      sleeps.clear();
    }
    function visible(value) {
      pet.classList.toggle("is-visible", value);
      pet.hidden = !value;
      if (value) protectControls(position);
    }
    function storeBreak() {
      try {
        if (hiddenUntil) sessionStorage.setItem(storageKey, String(hiddenUntil));
        else sessionStorage.removeItem(storageKey);
      } catch {}
    }
    const valid = (token) => !disposed && token === generation && !hiddenUntil && !blocked();
    async function animate(element, frames, duration, easing, token, track) {
      if (!valid(token)) return false;
      const active = element.animate(frames, { duration, easing, fill: "both" });
      motion = active;
      let pointerFrame = 0;
      const update = () => {
        if (disposed || motion !== active) return;
        track(Math.max(0, Math.min(1, Number(active.currentTime || 0) / duration)));
        pointerFrame = requestAnimationFrame(update);
      };
      if (track) update();
      try { await active.finished; }
      catch { return false; }
      finally { cancelAnimationFrame(pointerFrame); if (motion === active) motion = null; active.cancel(); }
      return valid(token);
    }
    async function move(to, action, duration, token) {
      if (!valid(token)) return false;
      to = clamp(to);
      pet.dataset.action = action;
      if (reduced.matches) {
        position = to; pet.style.transform = transform(to); protectControls(position); return true;
      }
      const from = position;
      if (action === "run") pet.style.setProperty("--wn-run-lean", to.x >= from.x ? "4deg" : "-4deg");
      const jump = action === "jump" ? Math.min(42, Math.max(0, Math.min(from.y, to.y) - bounds().top)) : 0;
      const obstacles = controls();
      const pointAt = (t) => {
        const smooth = t * t * (3 - 2 * t);
        return {
          x: from.x + (to.x - from.x) * smooth,
          y: from.y + (to.y - from.y) * smooth - Math.sin(Math.PI * t) * jump,
        };
      };
      const frames = Array.from({ length: 31 }, (_, i) => {
        const t = i / 30;
        return { offset: t, transform: transform(pointAt(t)) };
      });
      if (!await animate(pet, frames, duration, "linear", token,
        (t) => protectControls(pointAt(t), obstacles))) return false;
      position = to; pet.style.transform = transform(position); protectControls(position);
      return true;
    }
    async function rest(action, facing, duration, token) {
      if (!valid(token)) return false;
      pet.dataset.action = action; pet.dataset.facing = facing;
      await wait(duration);
      while (valid(token) && Date.now() < quietUntil) {
        pet.dataset.action = "doze";
        await wait(Math.min(1000, quietUntil - Date.now()));
      }
      return valid(token);
    }
    async function travel(index, edge, action, duration, facing, token) {
      pet.dataset.facing = facing;
      if (!await move(perch(index, edge), action, duration, token)) return false;
      anchor = index;
      return true;
    }
    async function roam(entrance = false) {
      stop();
      if (disposed || hiddenUntil || blocked()) return;
      const token = generation;
      pet.classList.remove("is-paused");
      position = perch(); pet.style.transform = transform(position);
      visible(true); pet.dataset.facing = "front";
      if (reduced.matches) { pet.dataset.action = "doze"; return; }
      if (entrance) {
        pet.dataset.action = "pop";
        if (!await animate(character, [
          { transform: "translateY(24px) scale(.15)", opacity: 0 },
          { transform: "translateY(-7px) scale(1.12)", opacity: 1, offset: .7 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ], 1000, "cubic-bezier(.2,.7,.3,1)", token)) return;
      }
      while (valid(token)) {
        const count = cards().length;
        const next = Math.min(1, count - 1), last = Math.max(0, count - 1);
        if (!await rest("curious", "front", 2200, token)) break;
        if (!await move(clamp({ ...position, x: position.x - 38 }), "walk", 3200, token)) break;
        if (!await rest("sit", "front", 3500, token)) break;
        if (!await travel(Math.max(0, next), null, "jump", 2400, "front", token)) break;
        if (!await rest("curious", "front", 1800, token)) break;
        if (!await travel(last, "bottom", "jump", 2600, "front", token)) break;
        if (!await travel(last, "top", "climb", 4800, "back", token)) break;
        if (!await rest("stretch", "back", 1800, token)) break;
        if (!await travel(last, null, "walk", 1600, "back", token)) break;
        if (!await rest("sit", "back", 6500, token)) break;
        if (!await travel(Math.min(2, last), null, "jump", 2800, "front", token)) break;
        if (!await rest("curious", "back", 3500, token)) break;
        if (!await rest("yawn", "front", 1800, token)) break;
        if (!await rest("doze", "front", 8500, token)) break;
        if (!await travel(0, null, "jump", 2800, "front", token)) break;
      }
    }
    function scheduleWake() {
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => {
        if (disposed) return;
        hiddenUntil = 0; storeBreak();
        announcement.textContent = "Nova is back.";
        refresh(true);
      }, Math.max(0, hiddenUntil - Date.now()));
    }
    function refresh(entrance = false) {
      stop();
      wasBlocked = Boolean(blocked());
      pet.classList.toggle("is-paused", wasBlocked);
      if (hiddenUntil > Date.now()) { visible(false); scheduleWake(); return; }
      if (hiddenUntil) { hiddenUntil = 0; storeBreak(); }
      if (wasBlocked) { visible(false); return; }
      roam(entrance);
    }
    async function hide() {
      if (hiddenUntil || disposed) return;
      stop();
      const token = generation;
      hiddenUntil = Date.now() + BREAK_MS; storeBreak(); scheduleWake();
      announcement.textContent = "Nova is taking a two-minute break.";
      pet.dataset.action = "sit"; pet.dataset.facing = "front";
      if (!reduced.matches) {
        const active = character.animate([
          { transform: "scale(1)", opacity: 1 },
          { transform: "translateY(-12px) scale(1.08)", opacity: 1, offset: .3 },
          { transform: "translateY(25px) scale(.05)", opacity: 0 },
        ], { duration: 700, easing: "ease-in", fill: "both" });
        motion = active;
        try { await active.finished; } catch {}
        finally { if (motion === active) motion = null; active.cancel(); }
      }
      if (!disposed && token === generation && hiddenUntil) visible(false);
    }
    async function call(event) {
      if (hiddenUntil || disposed || blocked() || pet.contains(event.target) ||
          !main()?.contains(event.target) || event.target.closest(`${interactive}, form`)) return;
      event.preventDefault();
      const selection = getSelection();
      if (selection && main().contains(selection.anchorNode)) selection.removeAllRanges();
      stop();
      const token = generation;
      quietUntil = 0;
      const target = clamp({ x: event.clientX - 28, y: event.clientY - 76 });
      const distance = Math.hypot(target.x - position.x, target.y - position.y);
      pet.dataset.facing = "front";
      if (!await move(target, "run", Math.max(650, Math.min(3500, distance / 190 * 1000)), token)) return;
      pet.dataset.action = reduced.matches ? "doze" : "sit";
      await wait(reduced.matches ? 1200 : 2200);
      if (!valid(token)) return;
      const home = perch();
      const returnDistance = Math.hypot(home.x - position.x, home.y - position.y);
      if (!await move(home, "walk", Math.max(1800, Math.min(3800, returnDistance / 125 * 1000)), token)) return;
      roam();
    }
    function working(event) {
      if (!pet.contains(event.target)) quietUntil = Date.now() + 15000;
    }
    function gaze(event) {
      if (pet.hidden || hiddenUntil || blocked()) return;
      // Let controls under a passing Nova receive their normal pointer actions.
      const box = pet.getBoundingClientRect();
      protectControls({ x: box.left, y: box.top });
      if (reduced.matches || pet.dataset.facing === "back" || pet.dataset.action === "doze") return;
      const face = pet.querySelector(".wn-screen").getBoundingClientRect();
      const x = Math.max(-2.3, Math.min(2.3, (event.clientX - face.x - face.width / 2) / 90));
      const y = Math.max(-1.8, Math.min(1.8, (event.clientY - face.y - face.height / 2) / 90));
      pet.querySelectorAll(".wn-pupil").forEach((pupil) => { pupil.style.transform = `translate(${x}px,${y}px)`; });
    }
    function focus(event) {
      if (!pet.contains(event.target)) queueMicrotask(() => { if (!disposed) refresh(); });
    }
    function reflow() {
      stop(); visible(false);
      clearTimeout(layoutTimer);
      layoutTimer = setTimeout(() => { if (!disposed) refresh(); }, 180);
    }
    const observer = new MutationObserver(() => {
      const nextContent = document.querySelector("#content > :first-child");
      if (Boolean(blocked()) !== wasBlocked) refresh();
      else if (nextContent !== contentRoot) { contentRoot = nextContent; reflow(); }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal"] });
    controller.current = { refresh: reflow };
    character.addEventListener("click", hide);
    document.addEventListener("dblclick", call);
    document.addEventListener("pointerdown", working, { passive: true });
    document.addEventListener("keydown", working);
    document.addEventListener("pointermove", gaze, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, { passive: true, capture: true });
    reduced.addEventListener("change", refresh);
    refresh(true);
    return () => {
      disposed = true; stop();
      clearTimeout(wakeTimer); clearTimeout(layoutTimer); observer.disconnect();
      character.removeEventListener("click", hide);
      document.removeEventListener("dblclick", call);
      document.removeEventListener("pointerdown", working);
      document.removeEventListener("keydown", working);
      document.removeEventListener("pointermove", gaze);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
      reduced.removeEventListener("change", refresh);
      controller.current = null;
    };
  }, [userId]);

  useEffect(() => {
    const previous = environment.current;
    environment.current = { view, paused };
    if (previous.view !== view || previous.paused !== paused) controller.current?.refresh();
  }, [view, paused]);

  return createPortal(
    <div ref={stage} className="workspace-nova" hidden data-action="doze" data-facing="front">
      <button className="wn-character" type="button" aria-label="Hide Nova for two minutes" title="Nova · Click for a two-minute break">
        <NovaArt />
      </button>
      <span className="wn-announcement" role="status" aria-live="polite" />
    </div>,
    document.body,
  );
}
