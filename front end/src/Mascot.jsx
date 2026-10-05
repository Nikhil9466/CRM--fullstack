import React, { useEffect, useId, useRef } from "react";
import "./mascot.css";

const messages = {
  happy: ["Hey, you!", "A good day starts with a hello."],
  excited: ["Ha! Let's go!", "You've made my day. All your details are in!"],
  error: [
    "Let's try again.",
    "Check the message by the form. You've got this.",
  ],
  busy: ["One little moment…", "Getting your workspace ready."],
  success: ["You're in!", "Here's to a good day, together."],
  help: ["I've got you.", "A little help is always a good thing."],
};

export default function Mascot({ mood = "happy", compact = false }) {
  const stage = useRef(null);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    const root = stage.current;
    const eyes = [...root.querySelectorAll(".nova-eye")];
    const pupils = [...root.querySelectorAll(".nova-gaze")];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let pointer = null;
    const positions = eyes.map(() => ({ x: 0, y: 0 }));
    const targets = eyes.map(() => ({ x: 0, y: 0 }));
    const draw = () => {
      frame = 0;
      if (reduced.matches || document.hidden) return;
      let moving = false;
      positions.forEach((p, i) => {
        p.x += (targets[i].x - p.x) * 0.23;
        p.y += (targets[i].y - p.y) * 0.23;
        pupils[i].setAttribute(
          "transform",
          `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`,
        );
        moving ||=
          Math.abs(targets[i].x - p.x) + Math.abs(targets[i].y - p.y) > 0.04;
      });
      if (moving) frame = requestAnimationFrame(draw);
    };
    const aim = () => {
      if (!root.getClientRects().length) return;
      eyes.forEach((eye, i) => {
        const box = eye.getBoundingClientRect();
        const dx = pointer ? pointer.x - box.x - box.width / 2 : 0;
        const dy = pointer ? pointer.y - box.y - box.height / 2 : 0;
        const angle = Math.atan2(dy, dx);
        const intensity = Math.min(Math.hypot(dx, dy) / 100, 1);
        targets[i] = {
          x: Math.cos(angle) * 8 * intensity,
          y: Math.sin(angle) * 10 * intensity,
        };
      });
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const move = (e) => {
      if (reduced.matches || e.pointerType === "touch") return;
      pointer = { x: e.clientX, y: e.clientY };
      aim();
    };
    const reset = () => {
      pointer = null;
      aim();
    };
    const leave = (e) => {
      if (!e.relatedTarget) reset();
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else reset();
    };
    const motionChange = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches)
        pupils.forEach((p) => p.setAttribute("transform", "translate(0 0)"));
      else reset();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", aim);
    window.addEventListener("scroll", aim, { passive: true });
    window.addEventListener("blur", reset);
    reduced.addEventListener("change", motionChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", aim);
      window.removeEventListener("scroll", aim);
      window.removeEventListener("blur", reset);
      reduced.removeEventListener("change", motionChange);
    };
  }, []);
  const [title, description] = messages[mood] || messages.happy;
  return (
    <div
      ref={stage}
      className={`mascot-stage${compact ? " mascot-compact" : ""}`}
      data-mood={mood}
    >
      <span className="nova-hello" aria-hidden="true">
        {title}
        <span>✧</span>
      </span>
      <svg
        className="nova-art"
        viewBox="0 0 400 350"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={`${id}-shell`}
            x1="119"
            y1="76"
            x2="284"
            y2="252"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fffef9" />
            <stop offset=".5" stopColor="#eff0ff" />
            <stop offset="1" stopColor="#c4c5e7" />
          </linearGradient>
          <linearGradient
            id={`${id}-face`}
            x1="136"
            y1="95"
            x2="266"
            y2="233"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#2d5356" />
            <stop offset="1" stopColor="#122d38" />
          </linearGradient>
          <linearGradient
            id={`${id}-body`}
            x1="161"
            y1="244"
            x2="244"
            y2="297"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#f9faff" />
            <stop offset="1" stopColor="#bfc3e3" />
          </linearGradient>
          <radialGradient id={`${id}-orb`} cx=".32" cy=".24" r=".8">
            <stop stopColor="#f8ffed" />
            <stop offset=".45" stopColor="#b5e1d2" />
            <stop offset="1" stopColor="#65a694" />
          </radialGradient>
        </defs>
        <ellipse
          cx="200"
          cy="316"
          rx="139"
          ry="20"
          fill="#c4b5e5"
          opacity=".32"
        />
        <ellipse
          className="nova-shadow"
          cx="200"
          cy="313"
          rx="75"
          ry="11"
          fill="#697286"
          opacity=".17"
        />
        <g className="nova-float">
          <path
            d="M159 266q-49 12-64-35"
            stroke="#9ca9bc"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M159 266q-49 12-64-35"
            stroke="#e9effa"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <circle
            cx="92"
            cy="226"
            r="12"
            fill="#f7f8ff"
            stroke="#a5adbd"
            strokeWidth="1.5"
          />
          <path
            d="m87 225 6 5m-3-11 6 5"
            stroke="#aeb9c8"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <g className="nova-wave">
            <path
              d="M242 266q47 10 60-44"
              stroke="#9ca9bc"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d="M242 266q47 10 60-44"
              stroke="#e9effa"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <rect
              x="294"
              y="197"
              width="22"
              height="29"
              rx="10"
              transform="rotate(12 305 212)"
              fill="#f8f9ff"
              stroke="#a5adbd"
              strokeWidth="1.5"
            />
            <path
              d="m301 204 7 1m-9 6 7 1"
              stroke="#aeb9c8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <rect
            x="158"
            y="292"
            width="35"
            height="17"
            rx="8.5"
            fill="#9199bd"
          />
          <rect
            x="208"
            y="292"
            width="35"
            height="17"
            rx="8.5"
            fill="#9199bd"
          />
          <path
            d="M165 297h18m32 0h18"
            stroke="#cbd0ee"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="153"
            y="238"
            width="95"
            height="59"
            rx="23"
            fill={`url(#${id}-body)`}
            stroke="#a4aec2"
            strokeWidth="1.5"
          />
          <path
            d="M167 250q30-9 61 0"
            stroke="#fff"
            strokeWidth="4"
            strokeLinecap="round"
            opacity=".8"
          />
          <circle
            cx="201"
            cy="264"
            r="13"
            fill="#c8e9dc"
            stroke="#99bbaa"
            strokeWidth="1.2"
          />
          <path
            d="m201 256 2.3 5.7 5.7 2.3-5.7 2.3-2.3 5.7-2.3-5.7-5.7-2.3 5.7-2.3 2.3-5.7Z"
            fill="#609782"
          />
          <path
            d="M175 283h8m36 0h8"
            stroke="#879bb1"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M201 76V47"
            stroke="#9da5c5"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M200 71V49"
            stroke="#e7e8ff"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="201"
            cy="35"
            r="16"
            stroke="#a1c5af"
            strokeWidth="1.2"
            opacity=".5"
          />
          <circle
            className="nova-antenna-light"
            cx="201"
            cy="35"
            r="10"
            fill={`url(#${id}-orb)`}
          />
          <circle cx="197" cy="31" r="2.7" fill="white" opacity=".9" />
          <rect
            x="79"
            y="129"
            width="22"
            height="47"
            rx="11"
            fill="#b6d8cc"
            stroke="#8daca5"
            strokeWidth="1.5"
          />
          <rect
            x="301"
            y="129"
            width="22"
            height="47"
            rx="11"
            fill="#b6d8cc"
            stroke="#8daca5"
            strokeWidth="1.5"
          />
          <path
            d="M88 141v20m226-20v20"
            stroke="#ecf8eb"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="94"
            y="72"
            width="212"
            height="178"
            rx="53"
            fill={`url(#${id}-shell)`}
            stroke="#aab3c6"
            strokeWidth="1.5"
          />
          <path
            d="M114 103q9-16 30-17h44"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            opacity=".85"
          />
          <path
            d="M285 212q-4 17-21 22h-26"
            stroke="#e9ebff"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".7"
          />
          <rect
            x="110"
            y="94"
            width="180"
            height="140"
            rx="40"
            fill={`url(#${id}-face)`}
            stroke="#385560"
            strokeWidth="2"
          />
          <path
            d="M124 132q2-24 27-25h87"
            stroke="#6e9b99"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".35"
          />
          <path
            d="m265 103 15 17-91 107h-36l112-124Z"
            fill="#fff"
            opacity=".025"
          />
          <g className="nova-face">
            <ellipse
              className="nova-cheek"
              cx="135"
              cy="180"
              rx="11"
              ry="5"
              fill="#76ccb9"
              opacity=".45"
            />
            <ellipse
              className="nova-cheek"
              cx="269"
              cy="180"
              rx="11"
              ry="5"
              fill="#76ccb9"
              opacity=".45"
            />
            <path
              className="nova-brow nova-brow-left"
              d="M151 113q12-6 25-1"
              stroke="#a6d5c5"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              className="nova-brow nova-brow-right"
              d="M229 112q12-5 25 1"
              stroke="#a6d5c5"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {[164, 241].map((cx, i) => (
              <g className={`nova-blink nova-blink-${i}`} key={cx}>
                <ellipse
                  className="nova-eye"
                  cx={cx}
                  cy="149"
                  rx="23"
                  ry="26"
                  fill="#fffef2"
                />
                <g className="nova-gaze">
                  <ellipse cx={cx} cy="149" rx="10" ry="14" fill="#1a3944" />
                  <circle cx={cx + 4} cy="144" r="3.7" fill="#fff" />
                  <circle cx={cx - 3} cy="155" r="1.8" fill="#709889" />
                </g>
              </g>
            ))}
            <g className="nova-mouth nova-mouth-happy">
              <path
                d="M182 187q20 22 40 0"
                stroke="#c3ead8"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d="m174 187-2 3m58-3 2 3"
                stroke="#729e9b"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
            <g className="nova-mouth nova-mouth-excited">
              <path
                d="M176 187q25 6 51 0c-2 24-12 38-26 38s-23-14-25-38Z"
                fill="#091a28"
                stroke="#729e9b"
                strokeWidth="1.2"
              />
              <path d="M181 190q20 4 41 0l-4 10h-34l-3-10Z" fill="#f7fff5" />
              <path d="M188 220q13-17 28 0-14 9-28 0Z" fill="#e5a0b2" />
            </g>
            <g className="nova-mouth nova-mouth-busy">
              <ellipse cx="201" cy="202" rx="7" ry="8" fill="#bce5d6" />
            </g>
          </g>
        </g>
        <g className="nova-sparkle">
          <path
            d="m64 92 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z"
            fill="#a590c7"
          />
          <path d="m335 262 2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z" fill="#83aa96" />
        </g>
        <circle cx="326" cy="80" r="4" fill="#b5a4d4" />
        <circle cx="66" cy="253" r="3" fill="#a5bc99" />
        <path
          d="m329 132 11-8m-8 17h12"
          stroke="#b7a1cd"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="nova-caption">
        <strong>Meet Nova.</strong> {description}
      </p>
    </div>
  );
}
