import { BODIES, GAPS, PD, PW, SLOTS, SLOT_GAP, lerp, positions } from "./facts";

/**
 * Scene. One renderer, one camera, eight bodies, three voids, two planes.
 *
 * Ported from the design reference (its module script, `createScene`). Every
 * number, material and shader is the reference's; what changed is that `three`
 * arrives as an argument rather than a bare import, so the module is loaded
 * lazily in the browser and never on the server, and that the handle now
 * carries a `dispose` for React to call on unmount.
 *
 * Everything is driven by a numeric state damped toward a target, and the loop
 * stops the moment nothing is moving.
 */

type Three = typeof import("three");

/** The narrative state. Every field is a number so the whole thing can be lerped. */
export interface State {
  [key: string]: number;
  peel: number;
  az: number;
  el: number;
  fov: number;
  vis: number;
  tx: number;
  ty: number;
  below: number;
  brk: number;
  ceil: number;
  hatch: number;
  focusGap: number;
  focusFee: number;
  baseVis: number;
  split: number;
  s0: number;
  s1: number;
  s2: number;
  flat: number;
  cx: number;
  cy: number;
  /** e0..e7: how strongly each plate is the current subject. */
  e0: number;
  e1: number;
  e2: number;
  e3: number;
  e4: number;
  e5: number;
  e6: number;
  e7: number;
}

export const DEFAULT: State = {
  peel: 0, az: -38, el: 18, fov: 28, vis: 760, tx: 0, ty: 242, below: 0, brk: 0, ceil: 0,
  hatch: 0, focusGap: 0, focusFee: 0, baseVis: 1, split: 0, s0: 0, s1: 0, s2: 0, flat: 0,
  cx: 0.5, cy: 0.5,
  e0: 1, e1: 1, e2: 1, e3: 1, e4: 1, e5: 1, e6: 1, e7: 1,
};

/** The plate under investigation keeps its full edge; the others recede. */
export function emphasis(active: number | number[] | null): Record<string, number> {
  const o: Record<string, number> = {};
  for (let i = 0; i < 8; i++) {
    const on =
      active == null ? true : Array.isArray(active) ? active.includes(i) : active === i;
    o["e" + i] = on ? 1 : 0.34;
  }
  return o;
}

export interface Flat {
  x: number;
  y: number[];
  planeY: number;
  sx?: number;
}

export interface Anchor {
  x: number;
  y: number;
  front: boolean;
}

export interface SceneHandle {
  cur: State;
  tgt: State;
  setTarget(o: Partial<State> | Record<string, number>): void;
  snap(o: Partial<State> | Record<string, number>): void;
  setFlat(f: Flat): void;
  onFrame(fn: ((s: State) => void) | null): void;
  anchors: {
    body: (i: number) => Anchor;
    bodyTop: (i: number) => Anchor;
    slot: (j: number) => Anchor;
    plane: () => Anchor;
    ceil: (side: "l" | "r") => Anchor;
  };
  kick(): void;
  dispose(): void;
}

const isMobile = () => matchMedia("(max-width: 820px)").matches;

export function createScene(THREE: Three, canvas: HTMLCanvasElement): SceneHandle | null {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer: import("three").WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 60000);
  /* physically-based light units: the paper faces should read as paper, not slate */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e0da, 2.3));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(-0.55, 1, 0.85);
  scene.add(dir);

  const C = (h: string) => new THREE.Color(h);
  const PAPER = C("#ecece9"),
    WARM = C("#e7e0cd"),
    BASEC = C("#dcdcd7"),
    INK = C("#121416"),
    AMBER2 = C("#b8871f"),
    PALE = C("#f3f3f0");
  const tmp = new THREE.Color();

  const hatchMat = () =>
    new THREE.ShaderMaterial({
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uPaper: { value: C("#f0ead9") },
        uLine: { value: C("#b8871f") },
        uSpacing: { value: 6.5 },
        uWidth: { value: 0.16 },
        uOpacity: { value: 0 },
        uLight: { value: new THREE.Vector3(-0.55, 1, 0.85) },
      },
      vertexShader: `varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uPaper, uLine; uniform float uSpacing, uWidth, uOpacity; uniform vec3 uLight; varying vec3 vW; varying vec3 vN;
      void main(){ float d = (vW.x + vW.y * 0.9 + vW.z * 0.55) / uSpacing; float f = fract(d); float aa = fwidth(d) * 1.1;
        float line = 1.0 - smoothstep(uWidth - aa, uWidth + aa, f);
        float lam = 0.86 + 0.14 * max(dot(normalize(vN), normalize(uLight)), 0.0);
        vec3 col = mix(uPaper * lam, uLine, line * 0.7); gl_FragColor = vec4(col, uOpacity); }`,
    });

  const edgesOf = (
    geo: import("three").BufferGeometry,
    color: import("three").Color,
    opacity: number,
  ) =>
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );

  const bodies = BODIES.map((b, i) => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(PW, b.thick, PD);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: b.base ? BASEC : PAPER, transparent: true }),
    );
    const edges = edgesOf(geo, INK, 0.62);
    edges.scale.setScalar(1.002);
    g.add(mesh, edges);
    let hatch: import("three").Mesh<
      import("three").BoxGeometry,
      import("three").ShaderMaterial
    > | null = null;
    let zz: import("three").Line | null = null;
    if (i === 0) {
      hatch = new THREE.Mesh(geo, hatchMat());
      g.add(hatch);
    }
    if (b.base) {
      /* the scale break: a zigzag around the slab at mid-height */
      const pts: import("three").Vector3[] = [];
      const amp = 3.2,
        seg = 9;
      const corners: Array<[number, number]> = [
        [-PW / 2, PD / 2],
        [PW / 2, PD / 2],
        [PW / 2, -PD / 2],
        [-PW / 2, -PD / 2],
        [-PW / 2, PD / 2],
      ];
      let k = 0;
      for (let s = 0; s < 4; s++) {
        const [x0, z0] = corners[s],
          [x1, z1] = corners[s + 1];
        for (let j = 0; j < seg; j++) {
          const t = j / seg;
          pts.push(new THREE.Vector3(lerp(x0, x1, t), k++ % 2 ? amp : -amp, lerp(z0, z1, t)));
        }
      }
      pts.push(pts[0].clone());
      zz = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 }),
      );
      zz.scale.set(1.006, 1, 1.01);
      g.add(zz);
    }
    scene.add(g);
    return { g, mesh, edges, hatch, zz, geo };
  });

  const slots = SLOTS.map((s) => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(PW, s.thick, PD);
    const mesh = new THREE.Mesh(geo, hatchMat());
    const edges = edgesOf(geo, AMBER2, 0);
    edges.scale.setScalar(1.003);
    g.add(mesh, edges);
    g.visible = false;
    scene.add(g);
    return { g, mesh, edges, geo };
  });

  const makePlane = (scale: number) => {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(PW * scale, PD * scale);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: AMBER2,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const edges = edgesOf(geo, AMBER2, 0);
    g.add(mesh, edges);
    g.visible = false;
    scene.add(g);
    return { g, mesh, edges, geo };
  };
  const plane = makePlane(1.28);
  const ceil = makePlane(1.34);

  const cur: State = { ...DEFAULT };
  const tgt: State = { ...DEFAULT };
  let flat: Flat = { x: 0, y: BODIES.map(() => 0), planeY: 0 };
  let W = 1,
    H = 1,
    dirty = true,
    running = false,
    last = 0,
    disposed = false;
  let onFrameFn: ((s: State) => void) | null = null;
  const rate = 7.5;

  function resize() {
    W = innerWidth;
    H = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile() ? 1.5 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    dirty = true;
    kick();
  }
  addEventListener("resize", resize, { passive: true });
  resize();

  const worldY = new Array<number>(8);

  function layout(s: State) {
    const P = positions(s.peel);
    /* once the object faces the viewer, the plates may widen into bars: a pure
       horizontal stretch of rectangles, applied only after the turn is done */
    const sx = lerp(1, flat.sx || 1, smoothstep((s.flat - 0.55) / 0.45));
    plane.g.scale.x = sx;
    ceil.g.scale.x = sx;
    for (let i = 0; i < 8; i++) {
      const b = bodies[i];
      const y = lerp(P.pos[i], flat.y[i], s.flat),
        x = lerp(0, flat.x, s.flat);
      b.g.position.set(x, y, 0);
      worldY[i] = y;
      b.g.scale.x = sx;
      const below = i >= 2 && i <= 6;
      const isBase = i === 7;
      let op = 1;
      if (isBase) op *= s.baseVis;
      if (i === 0 || i === 1 || isBase) op *= 1 - 0.78 * s.focusGap;
      if (i !== 0) op *= 1 - (isMobile() ? 0.96 : 0.82) * s.focusFee;
      const faceOp = op * (i === 0 ? (1 - s.hatch) * (1 - s.split) : 1);
      b.mesh.material.opacity = faceOp;
      b.mesh.visible = faceOp > 0.004;
      const em = s["e" + i];
      tmp.copy(isBase ? BASEC : PAPER);
      if (below) tmp.lerp(WARM, s.below);
      if (em < 1) tmp.lerp(PALE, (1 - em) * 0.3);
      b.mesh.material.color.copy(tmp);
      const edgeOp = 0.66 * op * (i === 0 ? 1 - s.split : 1) * (0.3 + 0.78 * em);
      b.edges.material.opacity = edgeOp;
      b.edges.visible = edgeOp > 0.004;
      tmp.copy(INK);
      if (below) tmp.lerp(AMBER2, 0.85 * s.below);
      b.edges.material.color.copy(tmp);
      if (b.hatch) {
        const ho = op * s.hatch * (1 - s.split);
        b.hatch.material.uniforms.uOpacity.value = ho;
        b.hatch.visible = ho > 0.004;
      }
      if (b.zz) {
        b.zz.material.opacity = 0.7 * op;
        b.zz.visible = op > 0.004;
      }
    }
    /* the three voids live inside the fee plate and separate as it splits */
    const feeY = worldY[0],
      feeX = bodies[0].g.position.x;
    const total = SLOTS.reduce((a, sl) => a + sl.thick, 0) + 2 * SLOT_GAP * s.split;
    let yTop = feeY + total / 2;
    slots.forEach((sl, j) => {
      const th = SLOTS[j].thick;
      sl.g.position.set(feeX, yTop - th / 2, 0);
      yTop -= th + SLOT_GAP * s.split;
      sl.g.scale.x = sx;
      const hi = s["s" + j];
      /* a missing field is an empty slot: outline first, fill only when it is the subject */
      const op = s.split * (0.1 + 0.9 * hi);
      sl.mesh.material.uniforms.uOpacity.value = op * 0.85;
      sl.edges.material.opacity = s.split * (0.55 + 0.45 * hi);
      sl.g.visible = s.split > 0.004;
    });
    /* the break plane sits in the gap under the refunds plate */
    const gap1 = GAPS[1] * P.open(1);
    const planeY = lerp(P.bot[1] - gap1 / 2, flat.planeY, s.flat);
    plane.g.position.set(lerp(0, flat.x, s.flat), planeY, 0);
    plane.mesh.material.opacity = 0.14 * s.brk;
    plane.edges.material.opacity = 0.95 * s.brk;
    plane.g.visible = s.brk > 0.004;
    /* the ceiling plane sits at the top of the verifiable basis: under the fee */
    const gap0 = GAPS[0] * P.open(0);
    ceil.g.position.set(0, P.bot[0] - gap0 / 2, 0);
    ceil.mesh.material.opacity = 0.12 * s.ceil;
    ceil.edges.material.opacity = 0.95 * s.ceil;
    ceil.g.visible = s.ceil > 0.004;
    /* camera: spherical about the target, framing a visible height */
    const dist = s.vis / (2 * Math.tan((s.fov * Math.PI) / 360));
    const az = (s.az * Math.PI) / 180,
      el = (s.el * Math.PI) / 180;
    camera.position.set(
      s.tx + dist * Math.cos(el) * Math.sin(az),
      s.ty + dist * Math.sin(el),
      dist * Math.cos(el) * Math.cos(az),
    );
    camera.fov = s.fov;
    camera.setViewOffset(W, H, (0.5 - s.cx) * W, (0.5 - s.cy) * H, W, H);
    camera.lookAt(s.tx, s.ty, 0);
  }

  function smoothstep(t: number) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const k = reduced ? 1 : 1 - Math.exp(-dt * rate);
    let moving = false;
    for (const key in tgt) {
      const d = tgt[key] - cur[key];
      if (Math.abs(d) > 1e-4) {
        cur[key] += d * k;
        moving = true;
      } else cur[key] = tgt[key];
    }
    layout(cur);
    renderer.render(scene, camera);
    dirty = false;
    if (onFrameFn) onFrameFn(cur);
    if (moving || dirty) requestAnimationFrame(frame);
    else running = false;
  }
  function kick() {
    if (!running && !disposed) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  const v = new THREE.Vector3();
  function project(x: number, y: number, z: number): Anchor {
    v.set(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, front: v.z < 1 };
  }
  const anchors = {
    body: (i: number) => {
      const g = bodies[i].g.position,
        sx = bodies[i].g.scale.x;
      return project(g.x + (PW / 2) * sx, g.y, PD / 2);
    },
    bodyTop: (i: number) => {
      const g = bodies[i].g.position;
      return project(g.x, g.y + BODIES[i].thick / 2, PD / 2);
    },
    slot: (j: number) => {
      const g = slots[j].g.position,
        sx = slots[j].g.scale.x;
      return project(g.x + (PW / 2) * sx, g.y, PD / 2);
    },
    plane: () => {
      const g = plane.g.position,
        sx = plane.g.scale.x;
      return project(g.x + PW * 0.64 * sx, g.y, PD * 0.64);
    },
    ceil: (side: "l" | "r") => {
      const g = ceil.g.position,
        sx = ceil.g.scale.x,
        sgn = side === "r" ? 1 : -1;
      return project(g.x + sgn * PW * 0.67 * sx, g.y, PD * 0.67);
    },
  };

  const onLost = (e: Event) => e.preventDefault();
  canvas.addEventListener("webglcontextlost", onLost);

  function renderNow() {
    layout(cur);
    renderer.render(scene, camera);
    if (onFrameFn) onFrameFn(cur);
  }

  return {
    cur,
    tgt,
    setTarget(o) {
      Object.assign(tgt, o);
      kick();
    },
    snap(o) {
      Object.assign(tgt, o);
      Object.assign(cur, tgt);
      dirty = true;
      renderNow();
      kick();
    },
    setFlat(f) {
      flat = f;
      dirty = true;
      kick();
    },
    onFrame(fn) {
      onFrameFn = fn;
    },
    anchors,
    kick,
    dispose() {
      disposed = true;
      onFrameFn = null;
      removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onLost);
      bodies.forEach((b) => b.geo.dispose());
      slots.forEach((s) => s.geo.dispose());
      plane.geo.dispose();
      ceil.geo.dispose();
      renderer.dispose();
    },
  };
}
