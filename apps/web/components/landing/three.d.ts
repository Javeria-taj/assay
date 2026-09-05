/**
 * The slice of three.js this page uses, declared.
 *
 * three r180 ships no type declarations of its own — they live in
 * `@types/three`, a dependency this app does not carry and does not need. What
 * follows is the exact surface `scene.ts` touches, and nothing else: if the
 * scene starts using a class or a member that is not here, the typechecker
 * says so rather than shrugging, which is the whole point of writing it out.
 *
 * Checked against the reference, which drives the same version through the
 * same calls.
 */
declare module "three" {
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    setScalar(v: number): this;
    clone(): Vector3;
    project(camera: Camera): this;
  }

  export class Color {
    constructor(color?: number | string);
    copy(c: Color): this;
    lerp(c: Color, alpha: number): this;
  }

  export class Object3D {
    position: Vector3;
    scale: Vector3;
    visible: boolean;
    userData: Record<string, unknown>;
    add(...objects: Object3D[]): this;
  }

  export class Scene extends Object3D {}

  export class Camera extends Object3D {}

  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
    /** Also refreshes the projection matrix, which is why nothing here calls that. */
    setViewOffset(
      fullWidth: number,
      fullHeight: number,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void;
    lookAt(x: number, y: number, z: number): void;
  }

  export class HemisphereLight extends Object3D {
    constructor(skyColor?: number | string, groundColor?: number | string, intensity?: number);
  }

  export class DirectionalLight extends Object3D {
    constructor(color?: number | string, intensity?: number);
  }

  export class BufferGeometry {
    setFromPoints(points: Vector3[]): this;
    rotateX(angle: number): this;
    dispose(): void;
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number);
  }

  export class EdgesGeometry extends BufferGeometry {
    constructor(geometry?: BufferGeometry, thresholdAngle?: number);
  }

  export class Material {
    transparent: boolean;
    opacity: number;
    dispose(): void;
  }

  export interface MaterialParameters {
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    side?: number;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  }

  export class MeshLambertMaterial extends Material {
    constructor(parameters?: MaterialParameters & { color?: Color | number | string });
    color: Color;
  }

  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MaterialParameters & { color?: Color | number | string });
    color: Color;
  }

  export class LineBasicMaterial extends Material {
    constructor(parameters?: MaterialParameters & { color?: Color | number | string });
    color: Color;
  }

  export interface Uniform {
    value: unknown;
  }

  export class ShaderMaterial extends Material {
    constructor(
      parameters?: MaterialParameters & {
        uniforms?: Record<string, Uniform>;
        vertexShader?: string;
        fragmentShader?: string;
      },
    );
    uniforms: Record<string, Uniform>;
  }

  export class Mesh<
    TGeometry extends BufferGeometry = BufferGeometry,
    TMaterial extends Material = Material,
  > extends Object3D {
    constructor(geometry?: TGeometry, material?: TMaterial);
    geometry: TGeometry;
    material: TMaterial;
  }

  export class LineSegments<
    TGeometry extends BufferGeometry = BufferGeometry,
    TMaterial extends Material = LineBasicMaterial,
  > extends Object3D {
    constructor(geometry?: TGeometry, material?: TMaterial);
    material: TMaterial;
  }

  export class Line<
    TGeometry extends BufferGeometry = BufferGeometry,
    TMaterial extends Material = LineBasicMaterial,
  > extends Object3D {
    constructor(geometry?: TGeometry, material?: TMaterial);
    material: TMaterial;
  }

  export class Group extends Object3D {}

  export interface WebGLRendererParameters {
    canvas?: HTMLCanvasElement;
    antialias?: boolean;
    alpha?: boolean;
    powerPreference?: "default" | "high-performance" | "low-power";
  }

  export class WebGLRenderer {
    constructor(parameters?: WebGLRendererParameters);
    setClearColor(color: number | string, alpha?: number): void;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
  }

  export const DoubleSide: number;
}
