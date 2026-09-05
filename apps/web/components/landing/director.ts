import {
  BODIES,
  CEIL_LABEL,
  FEE_LABEL,
  GAPS,
  PD,
  PLANE_LABEL,
  PW,
  SLOTS,
  centerOf,
  clamp,
  lerp,
  positions,
  smooth,
} from "./facts";
import { DEFAULT, emphasis, type Flat, type SceneHandle, type State } from "./scene";

/**
 * Director. Scroll is the input; every scroll position is a narrative state.
 *
 * Ported from the design reference's module script. It reads the markup the
 * page already rendered — `[data-seq]`, `.step[data-body]`, `[data-row]` — and
 * drives the scene, the callouts and the step classes from the scroll
 * position. When there is no WebGL it draws the same cross-section as a flat
 * SVG elevation and highlights the plate the reader is on instead.
 *
 * It owns no markup that React renders: the callouts and the fallback SVG are
 * created here and removed again by the returned cleanup, so a re-mount in
 * development leaves nothing behind.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const isMobile = () => matchMedia("(max-width: 820px)").matches;

interface Seq {
  id: string;
  el: HTMLElement;
  figure: HTMLElement;
  steps: HTMLElement[];
  n: number;
}

interface Lab {
  el: HTMLDivElement;
  ln: SVGLineElement;
  right: boolean;
  w?: number;
}

/** Which plate each step of sequence A is about. */
const STEP_BODY: Array<number | number[] | null> = [
  null, 0, 1, null, 2, 3, 4, 5, 6, 7, [2, 3, 4, 5, 6],
];

const camA = (i: number): [number, number, number] =>
  (
    [
      [-38, 18, 760],
      [-36, 18, 800],
      [-34, 17, 840],
      [-34, 17, 840],
      [-33, 16, 890],
      [-33, 16, 930],
      [-32, 15, 960],
      [-32, 15, 990],
      [-32, 15, 1020],
      [-32, 15, 1020],
    ] as Array<[number, number, number]>
  )[i];

function keysA(): State[] {
  const K: State[] = [];
  for (let i = 0; i <= 9; i++) {
    const peel = i <= 2 ? i : i === 3 ? 2 : Math.min(7, i - 1);
    const [az, el, vis] = camA(i);
    K.push({
      ...DEFAULT,
      peel,
      az,
      el,
      vis,
      ty: centerOf(peel, 0, 7),
      below: i >= 3 ? 1 : 0,
      brk: i >= 3 ? 1 : 0,
    });
  }
  K.push({
    ...K[9],
    az: -30,
    el: 10,
    vis: isMobile() ? 700 : 585,
    ty: centerOf(7, 2, 6),
    focusGap: 1,
  });
  return K;
}

function keysB(): State[] {
  const base: State = {
    ...DEFAULT,
    peel: 0.25,
    az: -38,
    el: 14,
    vis: 680,
    ty: centerOf(0.25, 0, 6),
    baseVis: 0,
    hatch: 1,
    ceil: 1,
  };
  const fee: State = { ...base, focusFee: 1, vis: 520, ty: centerOf(0.25, 0, 0), ceil: 0.35 };
  const split: State = { ...fee, split: 1, vis: 560, ceil: 0 };
  return [
    base,
    fee,
    split,
    { ...split, s0: 1 },
    { ...split, s0: 0.2, s1: 1 },
    { ...split, s0: 0.2, s1: 0.2, s2: 1 },
    { ...split, s0: 1, s1: 1, s2: 1 },
  ];
}

function blend(K: State[], T: number): State {
  const i = clamp(Math.floor(T), 0, K.length - 1),
    j = Math.min(i + 1, K.length - 1),
    f = smooth(clamp(T - i, 0, 1));
  const out = {} as State;
  for (const k in K[i]) out[k] = lerp(K[i][k], K[j][k], f);
  return out;
}

export interface DirectorHandle {
  /** Recompute now — the fields list calls this when a void is picked out. */
  refresh(): void;
  setHoverSlot(i: number): void;
  destroy(): void;
}

export function mountDirector(root: HTMLElement, scene: SceneHandle | null): DirectorHandle {
  const $ = <T extends Element>(s: string, r: ParentNode = root) => r.querySelector<T>(s);
  const $$ = <T extends Element>(s: string, r: ParentNode = root) => [...r.querySelectorAll<T>(s)];

  const canvas = $<HTMLCanvasElement>("#gl")!;
  const labelsEl = $<HTMLElement>("#labels")!;
  const nav = $<HTMLElement>("#nav")!;
  const recon = $<HTMLElement>("[data-recon]");

  const seqs: Seq[] = $$<HTMLElement>("[data-seq]").map((el) => {
    const steps = $$<HTMLElement>(".step", el);
    return { id: el.dataset.seq ?? "", el, figure: $<HTMLElement>("[data-figure]", el)!, steps, n: steps.length };
  });

  /* ------------------------------------------------------------- callouts */

  const LAB: Record<string, Lab> = {};
  const leaders = document.createElementNS(SVG_NS, "svg");
  leaders.setAttribute("class", "leaders");
  labelsEl.appendChild(leaders);

  function mkLab(id: string, t: string, n: string, cls = "", s = "") {
    const el = document.createElement("div");
    el.className = "lab " + cls;
    if (t) {
      const span = document.createElement("span");
      span.className = "lab__t";
      span.textContent = t;
      el.appendChild(span);
    }
    const num = document.createElement("span");
    num.className = "lab__n";
    num.textContent = n;
    el.appendChild(num);
    if (s) {
      const sub = document.createElement("span");
      sub.className = "lab__s";
      sub.textContent = s;
      el.appendChild(sub);
    }
    labelsEl.appendChild(el);
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("class", "leader" + (cls.includes("lab--amber") ? " leader--amber" : ""));
    leaders.appendChild(ln);
    LAB[id] = { el, ln, right: cls.includes("lab--right") };
  }

  BODIES.forEach((b, i) =>
    mkLab("body" + i, b.label, b.amt, i === 7 ? "lab--dim" : "", i === 7 ? "not to scale" : ""),
  );
  mkLab("plane", PLANE_LABEL.t, PLANE_LABEL.n, "lab--amber");
  mkLab("ceil", CEIL_LABEL.t, CEIL_LABEL.n, "lab--amber lab--right lab--ceil");
  mkLab("feeB", FEE_LABEL.t, FEE_LABEL.n, "lab--amber");
  SLOTS.forEach((s, j) => mkLab("slot" + j, s.label, s.amt, "lab--amber"));

  let labelMode: string | null = null;
  let hoverSlot = -1;
  let activeBody = -1;
  let stageBox: DOMRect | null = null;

  const labW = (L: Lab) => L.w || (L.w = L.el.offsetWidth);
  const clearWidths = () => {
    for (const k in LAB) LAB[k].w = 0;
  };
  addEventListener("resize", clearWidths, { passive: true });

  function hideLab(L: Lab) {
    L.el.style.opacity = "0";
    L.el.style.transform = "translate3d(-9999px,0,0)";
    L.ln.style.opacity = "0";
  }
  function placeLab(L: Lab, a: { x: number; y: number }, y: number, op: number) {
    L.el.style.opacity = String(op);
    const x = L.right ? a.x - 22 : a.x + 22;
    L.el.style.transform = L.right
      ? `translate3d(calc(${x.toFixed(1)}px - 100%), calc(${y.toFixed(1)}px - 50%), 0)`
      : `translate3d(${x.toFixed(1)}px, calc(${y.toFixed(1)}px - 50%), 0)`;
    L.ln.setAttribute("x1", a.x.toFixed(1));
    L.ln.setAttribute("y1", a.y.toFixed(1));
    L.ln.setAttribute("x2", (L.right ? a.x - 16 : a.x + 16).toFixed(1));
    L.ln.setAttribute("y2", y.toFixed(1));
    L.ln.style.opacity = op.toFixed(3);
  }

  /* labels are laid out like dimension callouts: each keeps its leader to the
     plate, and crowded ones are relaxed apart so none overlap */
  function updateLabels(s: State) {
    if (!scene) return;
    const on = canvas.classList.contains("is-on") ? 1 : 0;
    const open = (k: number) => smooth(clamp(s.peel - k, 0, 1));
    const items: Array<{ L: Lab; a: { x: number; y: number }; op: number }> = [];
    /* a label that is not the subject keeps its place and fades out, so nothing flies */
    const want = (id: string, a: { x: number; y: number; front: boolean }, op: number) => {
      const L = LAB[id];
      if (!a.front) {
        hideLab(L);
        return;
      }
      /* a callout that would reach into the text column is not drawn at all */
      if (op > 0.01 && stageBox) {
        const w = labW(L) + 34;
        const right = Math.min(stageBox.right + 10, innerWidth - 10),
          left = Math.max(stageBox.left - 10, 10);
        if (L.right ? a.x - w < left : a.x + w > right) op = 0;
      }
      if (op < 0.01) placeLab(L, a, a.y, 0);
      else items.push({ L, a, op });
    };
    /* one callout at a time: only the plate the reader is on is named */
    for (let i = 0; i < 8; i++) {
      const op = labelMode === "a" && i === activeBody ? open(Math.min(i, 6)) * on : 0;
      want("body" + i, scene.anchors.body(i), op);
    }
    /* on a phone the object is small: the plane keeps its line, not its label */
    want(
      "plane",
      scene.anchors.plane(),
      on *
        s.brk *
        (labelMode === "a" && !isMobile() ? (1 - s.focusGap) * (activeBody < 0 ? 1 : 0.5) : 0),
    );
    /* the ceiling callout sits to the left of the plane on a wide screen and to the right on a phone */
    const ceilRight = !isMobile();
    LAB.ceil.right = ceilRight;
    LAB.ceil.el.classList.toggle("lab--right", ceilRight);
    want("ceil", scene.anchors.ceil(ceilRight ? "l" : "r"), on * s.ceil * (labelMode === "b" ? 1 : 0));
    want(
      "feeB",
      scene.anchors.body(0),
      on * (labelMode === "b" ? s.hatch * (1 - s.split) * s.focusFee : 0),
    );
    for (let j = 0; j < 3; j++)
      want("slot" + j, scene.anchors.slot(j), on * s.split * (0.45 + 0.55 * s["s" + j]));
    const G = isMobile() ? 21 : 36;
    for (const side of [false, true]) {
      const g = items.filter((it) => it.L.right === side).sort((p, q) => p.a.y - q.a.y);
      const ys = g.map((it) => it.a.y);
      for (let it = 0; it < 10; it++)
        for (let i = 1; i < ys.length; i++) {
          const d = ys[i - 1] + G - ys[i];
          if (d > 0) {
            ys[i - 1] -= d / 2;
            ys[i] += d / 2;
          }
        }
      g.forEach((it, i) => placeLab(it.L, it.a, ys[i], it.op));
    }
  }
  if (scene) scene.onFrame(updateLabels);

  /* --------------------------------------------------------------- scroll */

  let active: Seq | null = null;
  let ticking = false;
  let keysC: () => State[] = () => [{ ...DEFAULT }, { ...DEFAULT }];
  const KEYS: Record<string, () => State[]> = { a: keysA, b: keysB, c: () => keysC() };

  const prodSeq = seqs.find((s) => s.id === "c");
  const rows = {
    plates: BODIES.map((_, i) =>
      prodSeq ? $<HTMLElement>(`[data-row="${i}"]`, prodSeq.el) : null,
    ),
    plane: prodSeq ? $<HTMLElement>('[data-row="plane"]', prodSeq.el) : null,
  };

  function stepT(seq: Seq, vh: number) {
    if (seq.id === "c") {
      const r = seq.el.getBoundingClientRect();
      return clamp(-r.top / (vh * 1.1), 0, 1);
    }
    if (isMobile()) {
      const r = seq.el.getBoundingClientRect();
      return clamp((-r.top + 1) / (vh * 0.7), 0, seq.n - 1);
    }
    /* a step is complete once its content has reached the centre of the viewport;
       the first step is the resting state, so it does not count */
    const trigger = vh * 0.56;
    let T = 0;
    for (let i = 1; i < seq.steps.length; i++) {
      const r = seq.steps[i].getBoundingClientRect();
      T += clamp((trigger - r.top) / (r.height * 0.6), 0, 1);
    }
    return T;
  }
  function stepClasses(seq: Seq, T: number) {
    const idx = clamp(Math.round(T), 0, seq.n - 1);
    seq.steps.forEach((st, i) => st.classList.toggle("is-active", i === idx));
    return idx;
  }
  function figureCenter(seq: Seq) {
    const r = seq.figure.getBoundingClientRect();
    return { cx: (r.left + r.width / 2) / innerWidth, cy: (r.top + r.height / 2) / innerHeight, r };
  }

  /* the product layout: plates land on the rows they become */
  function computeFlat(seq: Seq): { flat: Flat; vis: number; fov: number } {
    const { cy, r } = figureCenter(seq),
      vh = innerHeight;
    const mobile = isMobile();
    const fov = 8,
      cyPx = cy * vh;
    /* screen centres the plates must land on: the rows they become */
    let centers: number[], planeC: number;
    const measured = rows.plates.every(Boolean) && rows.plane;
    if (!mobile && measured) {
      centers = rows.plates.map((el) => {
        const rr = el!.getBoundingClientRect();
        return rr.top + rr.height / 2;
      });
      const pr = rows.plane!.getBoundingClientRect();
      planeC = pr.top + pr.height / 2;
    } else {
      const pitch = (r.height * 0.84) / 8,
        top = r.top + r.height * 0.08;
      centers = BODIES.map((_, i) => top + pitch * (i + 0.5));
      planeC = (centers[1] + centers[2]) / 2;
    }
    /* scale so the two thick plates, centred on adjacent rows, exactly touch;
       everything else is thinner than a row, so nothing overlaps */
    const dy = Math.max(24, centers[1] - centers[0]);
    const wppFront = (BODIES[0].thick / 2 + BODIES[1].thick / 2) / dy;
    const K = vh / (2 * Math.tan((fov * Math.PI) / 360));
    const wpp = wppFront + PD / (2 * K);
    const vis = wpp * vh;
    const widthPx = PW / wppFront;
    const sx = clamp((r.width * (mobile ? 0.56 : 0.46)) / widthPx, 1, 2.4);
    const ys = centers.map((c) => (cyPx - c) * wppFront);
    const planeY = (cyPx - planeC) * wppFront;
    return { flat: { x: 0, y: ys, planeY, sx }, vis, fov };
  }

  function update() {
    ticking = false;
    const vh = innerHeight;
    nav.classList.toggle("is-scrolled", scrollY > 8);
    if (recon) {
      const r = recon.getBoundingClientRect();
      const p = clamp(-r.top / (r.height - vh), 0, 1);
      recon.classList.toggle("is-twist", p > 0.46);
    }

    /* which sequence owns the viewport centre */
    let next: Seq | null = null;
    let pre = false;
    for (const s of seqs) {
      const r = s.el.getBoundingClientRect();
      if (r.top <= vh * 0.5 && r.bottom >= vh * 0.5) {
        next = s;
        break;
      }
    }
    if (!next) {
      const s = seqs.find((s) => {
        const r = s.el.getBoundingClientRect();
        return r.top < vh && r.top > vh * 0.5;
      });
      if (s && s.id !== "c") {
        next = s;
        pre = true;
      }
    }

    if (!next) {
      if (active) {
        active = null;
        canvas.classList.remove("is-on");
        if (scene) scene.kick();
      }
      return;
    }
    const seq = next;
    const T = pre ? 0 : stepT(seq, vh);
    const idx = stepClasses(seq, T);
    if (seq.id === "c") seq.el.classList.toggle("is-flat", T > 0.55);

    if (!scene) {
      fallbackState(seq, idx);
      return;
    }
    const { cx, cy, r } = figureCenter(seq);
    const mobile = isMobile();
    /* the object is framed for a full-height stage; a shorter stage sees more of the scene,
       and on a phone it sits left of centre so the callouts have room */
    const fit = mobile
      ? (vh / Math.max(1, r.height)) * 0.84
      : clamp(1300 / innerWidth, 1, 1.35);
    const cxAdj = mobile ? cx - 0.12 : cx - 0.02;
    let state: State;
    if (seq.id === "c") {
      const { flat, vis, fov } = computeFlat(seq);
      scene.setFlat(flat);
      const exploded: State = {
        ...DEFAULT,
        peel: 7,
        az: -38,
        el: 16,
        vis: 1180 * fit,
        ty: centerOf(7, 0, 7),
        below: 1,
        brk: 1,
        hatch: 1,
        cx: cxAdj,
        cy,
      };
      const flatK: State = { ...exploded, az: 0, el: 0, fov, vis, ty: 0, tx: 0, flat: 1, cx };
      keysC = () => [exploded, flatK];
      state = blend(keysC(), T);
    } else {
      state = blend(KEYS[seq.id](), T);
      if (seq.id === "a")
        Object.assign(state, emphasis(STEP_BODY[idx] === undefined ? null : STEP_BODY[idx]));
      if (seq.id === "b" && hoverSlot >= 0 && state.split > 0.5) {
        state.s0 = hoverSlot === 0 ? 1 : 0.2;
        state.s1 = hoverSlot === 1 ? 1 : 0.2;
        state.s2 = hoverSlot === 2 ? 1 : 0.2;
      }
      state.vis *= fit;
      state.cx = cxAdj;
      state.cy = cy;
    }
    labelMode = seq.id;
    stageBox = r;
    {
      const st = seq.steps[idx],
        b = st ? st.dataset.body ?? "" : "";
      activeBody = /^[0-7]$/.test(b) ? +b : -1;
    }
    const wasOff = !active || active.id !== seq.id;
    active = seq;
    if (wasOff) {
      scene.snap(state);
      canvas.classList.add("is-on");
    } else scene.setTarget(state);
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });

  /* --------------------------------------------------------- fallback (2D) */

  function buildFallback() {
    const k = 0.9;
    seqs.forEach((seq) => {
      const P = positions(7);
      const totalH = P.top[0] + 40;
      const g: string[] = [];
      BODIES.forEach((b, i) => {
        const y = (P.top[0] - P.top[i]) * k + 20;
        const below = i >= 2 && i <= 6;
        g.push(
          `<rect class="plate ${below ? "plate--below" : ""} ${b.base ? "plate--base" : ""} ${
            i === 0 ? "plate--fee" : ""
          }" data-body="${i}" x="40" y="${y.toFixed(1)}" width="${PW * k}" height="${(
            b.thick * k
          ).toFixed(1)}"/>`,
        );
        g.push(
          `<text x="${40 + PW * k + 12}" y="${(y + (b.thick * k) / 2 + 4).toFixed(1)}">${b.amt}</text>`,
        );
      });
      const py = (P.top[0] - (P.bot[1] - GAPS[1] / 2)) * k + 20;
      g.push(`<line class="brk" x1="20" x2="${60 + PW * k}" y1="${py.toFixed(1)}" y2="${py.toFixed(1)}"/>`);
      g.push(
        `<text class="t-amber" x="${40 + PW * k + 12}" y="${(py + 3).toFixed(1)}">${
          PLANE_LABEL.n
        } expected</text>`,
      );
      seq.figure.insertAdjacentHTML(
        "beforeend",
        `<div class="stack2d"><svg viewBox="0 0 ${PW * k + 220} ${
          totalH * k + 40
        }" role="img" aria-label="The settlement cross-section, to scale">
      <defs><pattern id="landing-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f0ead9"/><line x1="0" y1="0" x2="0" y2="6" stroke="#b8871f" stroke-width="1"/></pattern></defs>${g.join(
        "",
      )}</svg></div>`,
      );
    });
  }
  function fallbackState(seq: Seq, idx: number) {
    const st = seq.steps[idx];
    const body = st ? st.dataset.body ?? "" : "";
    $$<SVGRectElement>(".plate", seq.figure).forEach((p) =>
      p.classList.toggle(
        "is-hi",
        body !== "" &&
          (p.dataset.body === body ||
            (body === "gap" && +(p.dataset.body ?? "") >= 2 && +(p.dataset.body ?? "") <= 6) ||
            (body.startsWith("slot") && p.dataset.body === "0")),
      ),
    );
  }
  if (!scene) {
    root.classList.add("no-webgl");
    buildFallback();
  }

  /* ----------------------------------------------------------- reveals */

  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.35 },
  );
  $$("[data-io]").forEach((el) => io.observe(el));

  /* provenance: hovering one kind of evidence quiets the others */
  const prov = $<HTMLElement>("#method");
  const box = prov ? $<HTMLElement>(".ch__b", prov) : null;
  function hl(kind: string | null) {
    if (!box) return;
    if (!kind) {
      delete box.dataset.hl;
      $$<HTMLElement>(".exhibit__row", box).forEach((r) => r.classList.remove("is-kin"));
      return;
    }
    box.dataset.hl = kind;
    $$<HTMLElement>(".exhibit__row", box).forEach((r) =>
      r.classList.toggle("is-kin", r.dataset.kind === kind),
    );
  }
  const provOver = (e: Event) => {
    const c = (e.target as Element).closest<HTMLElement>(".chip[data-kind]");
    if (c) hl(c.dataset.kind ?? null);
  };
  const provOut = (e: Event) => {
    if ((e.target as Element).closest(".chip[data-kind]")) hl(null);
  };
  prov?.addEventListener("mouseover", provOver);
  prov?.addEventListener("mouseout", provOut);

  /* missing fields: pointing at a field lights its void */
  const fields = $<HTMLElement>("#fields");
  const fieldsOver = (e: Event) => {
    const li = (e.target as Element).closest<HTMLElement>("[data-slot]");
    if (li) {
      hoverSlot = +(li.dataset.slot ?? -1);
      onScroll();
    }
  };
  const fieldsOut = (e: Event) => {
    if ((e.target as Element).closest("[data-slot]")) {
      hoverSlot = -1;
      onScroll();
    }
  };
  const fieldsClick = (e: Event) => {
    const li = (e.target as Element).closest<HTMLElement>("[data-slot]");
    if (!li || !fields) return;
    const s = +(li.dataset.slot ?? -1);
    hoverSlot = hoverSlot === s ? -1 : s;
    $$<HTMLElement>("[data-slot]", fields).forEach((x) =>
      x.classList.toggle("is-hot", +(x.dataset.slot ?? -1) === hoverSlot),
    );
    onScroll();
  };
  fields?.addEventListener("mouseover", fieldsOver);
  fields?.addEventListener("mouseout", fieldsOut);
  fields?.addEventListener("click", fieldsClick);

  update();

  return {
    refresh: onScroll,
    setHoverSlot(i: number) {
      hoverSlot = i;
      onScroll();
    },
    destroy() {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("resize", clearWidths);
      io.disconnect();
      prov?.removeEventListener("mouseover", provOver);
      prov?.removeEventListener("mouseout", provOut);
      fields?.removeEventListener("mouseover", fieldsOver);
      fields?.removeEventListener("mouseout", fieldsOut);
      fields?.removeEventListener("click", fieldsClick);
      if (scene) scene.onFrame(null);
      labelsEl.replaceChildren();
      seqs.forEach((s) => s.figure.querySelector(".stack2d")?.remove());
      canvas.classList.remove("is-on");
    },
  };
}
