"use client";

import { useEffect } from "react";

/**
 * The entrance cascade.
 *
 * Every animation on the console is gated behind a single `anim` class on the
 * body: the verdict rule draws, each figure's digits rise in sequence, the
 * waterfall rows lift one after another, the break rule draws itself, and the
 * ceiling bar grows. Without the class the stylesheet's keyframes match nothing
 * and the screen simply appears.
 *
 * The class is removed once the cascade has run, so a later re-render cannot
 * replay it and nothing animates while somebody is reading. Re-adding it is how
 * a scene change replays the reveal, which is why this takes a key.
 *
 * Two things here are load-bearing, and both were learnt by breaking the page:
 *
 * 1. The removal timer starts only once the class is actually on the body. It
 *    used to start alongside the `requestAnimationFrame` that adds it, which is
 *    a race: in a backgrounded tab rAF is throttled, so the class could land
 *    *after* the timer had already fired and would then never be removed. Every
 *    `.anim` rule opens at `opacity: 0`, so the whole screen stayed blank.
 * 2. The cleanup removes the class unconditionally. A cascade interrupted by a
 *    scene change must not leave the page holding an opacity of zero.
 *
 * The per-element stagger comes from `--o` on the rows and `--i` on the digits;
 * this only decides when the cascade starts.
 */
const REVEAL_MS = 2800;

export function useReveal(key: unknown): void {
  useEffect(() => {
    const body = document.body;
    let done: ReturnType<typeof setTimeout> | undefined;

    /* Removing first matters: re-adding a class an element already has does not
     * restart a CSS animation, but a frame between the two does. */
    body.classList.remove("anim");

    const raf = requestAnimationFrame(() => {
      body.classList.add("anim");
      /* Only now, so a throttled frame cannot outlive its own cleanup. */
      done = setTimeout(() => body.classList.remove("anim"), REVEAL_MS);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (done) clearTimeout(done);
      body.classList.remove("anim");
    };
  }, [key]);
}
