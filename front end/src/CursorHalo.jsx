import { useEffect } from "react";
import "./interactions.css";

export default function CursorHalo() {
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const halo = document.createElement("div");
    halo.className = "cursor-halo";
    halo.setAttribute("aria-hidden", "true");
    document.body.append(halo);
    let x = 0,
      y = 0,
      targetX = 0,
      targetY = 0,
      frame = 0,
      active = false;
    const stop = () => {
      active = false;
      cancelAnimationFrame(frame);
      frame = 0;
      halo.classList.remove("visible", "pressed");
    };
    const tick = () => {
      frame = 0;
      if (!active) return;
      x += (targetX - x) * 0.22;
      y += (targetY - y) * 0.22;
      halo.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.15)
        frame = requestAnimationFrame(tick);
    };
    const move = (e) => {
      if (!fine.matches || reduced.matches || e.pointerType === "touch") return;
      targetX = e.clientX;
      targetY = e.clientY;
      if (!active) {
        x = targetX;
        y = targetY;
        active = true;
      }
      halo.classList.add("visible");
      halo.classList.toggle(
        "over-control",
        !!e.target.closest("a,button,[role=button]"),
      );
      halo.classList.toggle(
        "over-input",
        !!e.target.closest("input,textarea,select"),
      );
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const down = () => halo.classList.add("pressed");
    const up = () => halo.classList.remove("pressed");
    const leave = (e) => {
      if (!e.relatedTarget) stop();
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointerup", up, { passive: true });
    document.addEventListener("pointerout", leave);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", stop);
    fine.addEventListener("change", stop);
    reduced.addEventListener("change", stop);
    return () => {
      cancelAnimationFrame(frame);
      halo.remove();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", stop);
      fine.removeEventListener("change", stop);
      reduced.removeEventListener("change", stop);
    };
  }, []);
  return null;
}
