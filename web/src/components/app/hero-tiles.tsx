"use client";

import { useEffect, useRef } from "react";

// Solid, saturated, slightly clashing swatches with the text color baked in.
type Swatch = { bg: string; fg: string };
const SWATCHES: Swatch[] = [
  { bg: "#0a0a0a", fg: "#ffffff" },
  { bg: "#ff2e20", fg: "#0a0a0a" },
  { bg: "#f0c2f7", fg: "#0a0a0a" },
  { bg: "#22e58b", fg: "#0a0a0a" },
  { bg: "#7c4dff", fg: "#ffffff" },
  { bg: "#ffe14d", fg: "#0a0a0a" },
  { bg: "#18b6ff", fg: "#0a0a0a" },
  { bg: "#ff7a1a", fg: "#0a0a0a" },
  { bg: "#ff4fa3", fg: "#0a0a0a" },
];

const FLY_STAGGER = 130;
const FLY_MS = 760;
const SHUFFLE_MIN = 1300;
const SHUFFLE_MAX = 3200;
const COLOR_MS = 520;
const EASE_OUT = "cubic-bezier(.16,1,.3,1)";

function pickAvoiding(used: Swatch[]): Swatch {
  const free = SWATCHES.filter((s) => !used.includes(s));
  const pool = free.length ? free : SWATCHES;
  return pool[(Math.random() * pool.length) | 0];
}

/**
 * A short lowercase sentence as adjacent solid-color tiles packed into one rounded bar.
 * Tiles wipe open left to right (clip-path, so text never distorts), then idly re-roll colors;
 * hovering a tile re-rolls it at once. Reduced motion: the assembled bar, static.
 */
export function HeroTiles({ words }: { words: string[] }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const tiles = refs.current.filter((el): el is HTMLSpanElement => !!el);
    const swatches = tiles.map((_, i) => SWATCHES[i % SWATCHES.length]);
    const paint = (el: HTMLSpanElement, s: Swatch) => {
      el.style.backgroundColor = s.bg;
      el.style.color = s.fg;
    };
    tiles.forEach((el, i) => paint(el, swatches[i]));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      tiles.forEach((el) => Object.assign(el.style, { clipPath: "inset(0 0 0 0)", opacity: "1", transform: "none", transition: "none" }));
      return;
    }

    const timers: number[] = [];
    const next: number[] = [];
    const recolor = (i: number) => {
      const used = swatches.filter((_, j) => j !== i).concat(swatches[i]);
      swatches[i] = pickAvoiding(used);
      paint(tiles[i], swatches[i]);
    };
    const schedule = (i: number, from: number) => {
      next[i] = from + SHUFFLE_MIN + Math.random() * (SHUFFLE_MAX - SHUFFLE_MIN);
    };

    // Fly in: wipe open + small rise + fade, staggered.
    tiles.forEach((el, i) => {
      el.style.transition = [
        `clip-path ${FLY_MS}ms ${EASE_OUT}`,
        `transform ${FLY_MS}ms ${EASE_OUT}`,
        `opacity ${Math.round(FLY_MS * 0.8)}ms ease`,
        `background-color ${COLOR_MS}ms ease`,
        `color ${COLOR_MS}ms ease`,
      ].join(", ");
      timers.push(
        window.setTimeout(() => {
          Object.assign(el.style, { clipPath: "inset(0 0 0 0)", opacity: "1", transform: "translateY(0)" });
        }, 80 + i * FLY_STAGGER),
      );
    });
    const assembledAt = performance.now() + tiles.length * FLY_STAGGER + FLY_MS;
    tiles.forEach((_, i) => schedule(i, assembledAt));

    // Idle shuffle: each tile on its own timer.
    let raf = 0;
    const loop = (now: number) => {
      tiles.forEach((_, i) => {
        if (now >= next[i]) {
          recolor(i);
          schedule(i, now);
        }
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Hover re-rolls immediately.
    const offs = tiles.map((el, i) => {
      const onEnter = () => {
        recolor(i);
        schedule(i, performance.now());
      };
      el.addEventListener("pointerenter", onEnter);
      return () => el.removeEventListener("pointerenter", onEnter);
    });

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => clearTimeout(t));
      offs.forEach((off) => off());
    };
  }, [words]);

  return (
    <span aria-hidden className="inline-flex max-w-full overflow-hidden rounded-2xl select-none">
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="px-[0.32em] py-[0.12em] text-[clamp(2.75rem,9vw,6.5rem)] leading-none font-bold tracking-[-0.045em] whitespace-nowrap"
          style={{ clipPath: "inset(0 100% 0 0)", opacity: 0, transform: "translateY(0.18em)" }}
        >
          {w}
        </span>
      ))}
    </span>
  );
}
