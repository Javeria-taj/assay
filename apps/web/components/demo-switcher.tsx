"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The demo state switcher. Ported from the design reference (markup at line
 * 840, behaviour from `toggleMenu` / `setScene` / `closeMenus`).
 *
 * Why this exists at all: the expired state is the beat that shows what the
 * product is FOR. Open and closing show a merchant a right she still holds;
 * expired shows her the one she no longer does, and that contrast is the whole
 * argument. It arrives seventy-two hours after a settlement lands, and a
 * recording cannot wait three real days for it.
 *
 * What it deliberately does not do: it does not mutate data, it does not call
 * the API, it does not touch the clock on the server. It carries one value up
 * to the console, which reads it as an override on which window status to
 * display. The figures underneath — the gap, the ceiling, the citations — stay
 * exactly what the API returned, because a switcher that edited the money
 * would make every number on screen unfalsifiable.
 *
 * `live` is the default, and it means "show whatever the API actually
 * returned". The screen tells the truth unless someone deliberately overrides
 * it, and the dot in the corner is how you know which of the two you are
 * looking at.
 */

export type DemoWindowState = "live" | "open" | "closing" | "expired";

/** Menu order. `live` first: the truth is the top of the list, not a footnote. */
const STATES: readonly DemoWindowState[] = ["live", "open", "closing", "expired"];

/**
 * The dot, from the reference's own mapping in `setScene`: expired is red,
 * closing is amber, everything else is ink. It reads at a glance from across a
 * room, which is the point of a control that appears on camera.
 */
const DOT: Record<DemoWindowState, string> = {
  live: "var(--ink)",
  open: "var(--ink)",
  closing: "var(--amber-2)",
  expired: "var(--red)",
};

export type DemoSwitcherProps = {
  value: DemoWindowState;
  onChange: (v: DemoWindowState) => void;
};

export function DemoSwitcher({ value, onChange }: DemoSwitcherProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  /* Closing by keyboard hands focus back to the button; closing by clicking
   * somewhere else leaves focus where the pointer put it. */
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus();
  }, []);

  /* Escape and outside click. Both listeners exist only while the menu is
   * open, so a closed menu costs the page nothing and cannot swallow an
   * Escape meant for the drawer or the sheet. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  /* Opening moves focus into the menu, the way the reference's `toggleMenu`
   * does. A menu you can open but not reach is not keyboard accessible. */
  useEffect(() => {
    if (!open) return;
    const items = list.current?.querySelectorAll<HTMLButtonElement>(".menu__item");
    items?.[0]?.focus();
  }, [open]);

  /* Roving arrow keys inside the menu. The list declares role="menu" and
   * role="menuitemradio", so up and down are what a screen-reader user will
   * reach for; Home and End come with that contract. */
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>(".menu__item") ?? [],
    );
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? (at + 1 + items.length) % items.length
            : (at - 1 + items.length) % items.length;
    e.preventDefault();
    items[next]?.focus();
  };

  const pick = (v: DemoWindowState) => {
    onChange(v);
    close(true);
  };

  return (
    <div className="demo" id="demo" ref={root}>
      <button
        className="demo__btn"
        id="demo-btn"
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="demo-list"
        data-action="toggle-demo"
        onClick={() => setOpen((o) => !o)}
      >
        <i aria-hidden="true" style={{ background: DOT[value] }} />
        <span>
          state · <span id="demo-label">{value}</span>
        </span>
      </button>
      <div
        className="demo__list"
        id="demo-list"
        ref={list}
        role="menu"
        aria-label="Demo states"
        hidden={!open}
        onKeyDown={onListKeyDown}
      >
        <div className="menu__k">window</div>
        {STATES.map((s) => (
          <button
            key={s}
            className="menu__item"
            type="button"
            role="menuitemradio"
            aria-checked={value === s}
            data-action="set-scene"
            data-scene={s}
            onClick={() => pick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
