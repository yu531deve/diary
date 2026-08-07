/**
 * particles/engine.ts
 *
 * トップページ（design/01_top_scroll）とローディング演出（design/04_loading）が
 * 共有する canvas パーティクルエンジン。
 *
 * このモジュールは「どのターゲット座標に向かうか」を決めるロジック（スクロール進捗の
 * 区間補間、delay 付き収束アニメなど）は持たない。それは各ページ側が
 * `particles/interpolate.ts` と `particles/targets.ts` を使って組み立て、
 * 毎フレーム `resolveTarget(index)` として渡す。エンジンはそれを受けて
 * 「DPR 対応・トレイル描画・fillRect 描画・マウス反発・reduced-motion 縮退」だけを担当する。
 *
 * 詳しい使い方は同ディレクトリの README.md を参照。
 */

import type { Point } from "./targets";

export interface Particle {
  x: number;
  y: number;
  /** アクセント色（シアン）を使うかどうか */
  accent: boolean;
  /** fillRect のサイズ（px） */
  size: number;
  /** 微振動の位相 */
  phase: number;
}

export interface EngineColors {
  /** アクセント色（design 既定 rgba(82,224,245,.95)） */
  accent: string;
  /** 通常色（design 既定 rgba(226,236,244,.78)） */
  base: string;
  /** アクセント色の割合（design 既定 0.16 = 16%） */
  accentRatio: number;
}

export interface MouseRepelOptions {
  /** 反発が働く半径（px）。design 既定 120 */
  radius: number;
  /** 反発の最大強度（px）。design 既定 5 */
  strength: number;
}

export interface EngineOptions {
  /** トレイルの塗りつぶし色。design 既定 'rgba(5,6,10,0.34)' */
  trailColor?: string;
  /** devicePixelRatio の上限。design 既定 1.5 */
  dprMax?: number;
  colors?: Partial<EngineColors>;
  /** パーティクルサイズの範囲（px）。design 既定 [1.1, 2.5] */
  sizeRange?: [number, number];
  /** 追従の lerp 係数。design 既定 0.09 */
  followLerp?: number;
  /** 微振動の振幅。design 既定 0.3 */
  wobbleAmp?: number;
  /** マウス反発。false で無効（既定） */
  mouseRepel?: MouseRepelOptions | false;
  /**
   * reduced-motion かどうか。省略時は `prefers-reduced-motion: reduce` を自動判定する。
   * ページ側で明示的に上書きしたい場合に指定する。
   */
  reducedMotion?: boolean;
  /** canvas に `aria-hidden="true"` を設定するか。既定 true */
  ariaHidden?: boolean;
}

const DEFAULT_COLORS: EngineColors = {
  accent: "rgba(82,224,245,0.95)",
  base: "rgba(226,236,244,0.78)",
  accentRatio: 0.16,
};

export interface FrameContext {
  now: number;
  width: number;
  height: number;
  ctx: CanvasRenderingContext2D;
  /** ビューポート座標系でのマウス位置（未計測時は画面外扱いの巨大な値） */
  mouse: { x: number; y: number };
}

export type TargetResolver = (index: number, frame: FrameContext) => Point;

/** フレームごとに、パーティクル描画の前に呼ばれる追加描画フック（design 01 の放物線領域塗りなど）。 */
export type ExtraDrawHook = (frame: FrameContext) => void;

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export class ParticleEngine {
  readonly canvas: HTMLCanvasElement;
  private opts: {
    trailColor: string;
    dprMax: number;
    colors: EngineColors;
    sizeRange: [number, number];
    followLerp: number;
    wobbleAmp: number;
    mouseRepel: MouseRepelOptions | false;
    ariaHidden: boolean;
  };
  private colors: EngineColors;
  private particles: Particle[] = [];
  private mouse = { x: -9999, y: -9999 };
  private raf: number | null = null;
  private onMouseMove = (e: MouseEvent) => {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  };
  private _reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.canvas = canvas;
    this.opts = {
      trailColor: options.trailColor ?? "rgba(5,6,10,0.34)",
      dprMax: options.dprMax ?? 1.5,
      colors: { ...DEFAULT_COLORS, ...options.colors } as EngineColors,
      sizeRange: options.sizeRange ?? [1.1, 2.5],
      followLerp: options.followLerp ?? 0.09,
      wobbleAmp: options.wobbleAmp ?? 0.3,
      mouseRepel: options.mouseRepel ?? false,
      ariaHidden: options.ariaHidden ?? true,
    };
    this.colors = this.opts.colors;
    this._reducedMotion = options.reducedMotion ?? detectReducedMotion();

    if (this.opts.ariaHidden) {
      canvas.setAttribute("aria-hidden", "true");
    }
  }

  get reducedMotion(): boolean {
    return this._reducedMotion;
  }

  /** マウス座標の追跡を開始する（マウス反発を使うページのみ呼べばよい）。 */
  enableMouseTracking(target: Window | HTMLElement = window): void {
    target.addEventListener("mousemove", this.onMouseMove as EventListener);
  }

  disableMouseTracking(target: Window | HTMLElement = window): void {
    target.removeEventListener("mousemove", this.onMouseMove as EventListener);
  }

  /** パーティクル数を設定する。既存の位置は可能な限り維持する（サイズ変更時の作り直しコスト対策）。 */
  setParticleCount(n: number, seed?: (index: number) => Partial<Particle>): void {
    const next: Particle[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = this.particles[i];
      if (prev) {
        next[i] = prev;
        continue;
      }
      const custom = seed?.(i);
      next[i] = {
        x: custom?.x ?? Math.random() * this.canvas.clientWidth,
        y: custom?.y ?? Math.random() * this.canvas.clientHeight,
        accent: custom?.accent ?? Math.random() < this.colors.accentRatio,
        size: custom?.size ?? this.randomSize(),
        phase: custom?.phase ?? Math.random() * Math.PI * 2,
      };
    }
    this.particles = next;
  }

  /** 現在のパーティクル配列（読み取り専用として扱うこと）。 */
  getParticles(): readonly Particle[] {
    return this.particles;
  }

  private randomSize(): number {
    const [min, max] = this.opts.sizeRange;
    return Math.random() * (max - min) + min;
  }

  /** canvas の内部解像度を CSS サイズ × DPR(上限あり) に合わせる。サイズが変わったら true を返す。 */
  private syncCanvasSize(): { width: number; height: number; changed: boolean } {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.dprMax);
    const pxW = Math.round(width * dpr);
    const pxH = Math.round(height * dpr);
    const changed = this.canvas.width !== pxW || this.canvas.height !== pxH;
    if (changed) {
      this.canvas.width = pxW;
      this.canvas.height = pxH;
    }
    const ctx = this.canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, changed };
  }

  /**
   * アニメーションループを開始する。
   *
   * `resolveTarget(i, frame)` は毎フレーム・毎パーティクルについて呼ばれ、
   * そのパーティクルが向かうべき座標を返す（スクロール進捗の区間補間や
   * delay 付き収束など、ページ固有のロジックはここに書く）。
   *
   * reduced-motion のときは自動的にループを開始せず、`resolveTarget` を
   * 一度だけ呼んで静止形を 1 回描画する（フレーム番号は `now = 0` 固定）。
   */
  start(resolveTarget: TargetResolver, extraDraw?: ExtraDrawHook): void {
    this.stop();
    if (this._reducedMotion) {
      this.renderOnce(resolveTarget, extraDraw);
      return;
    }
    const tick = (now: number) => {
      this.renderFrame(now, resolveTarget, extraDraw);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  /** reduced-motion 用: アニメーションせず、ターゲット位置に静止した状態を 1 回だけ描画する。 */
  renderOnce(resolveTarget: TargetResolver, extraDraw?: ExtraDrawHook): void {
    const { width, height } = this.syncCanvasSize();
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const frame: FrameContext = { now: 0, width, height, ctx, mouse: this.mouse };

    // トレイルなし・背景を1回だけ塗って最終形のみ描く
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, width, height);
    extraDraw?.(frame);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const target = resolveTarget(i, frame);
      p.x = target.x;
      p.y = target.y;
      this.drawParticle(ctx, p);
    }
  }

  private renderFrame(now: number, resolveTarget: TargetResolver, extraDraw?: ExtraDrawHook): void {
    const { width, height } = this.syncCanvasSize();
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const frame: FrameContext = { now, width, height, ctx, mouse: this.mouse };

    ctx.fillStyle = this.opts.trailColor;
    ctx.fillRect(0, 0, width, height);

    extraDraw?.(frame);

    const repel = this.opts.mouseRepel;
    const followLerp = this.opts.followLerp;
    const wobbleAmp = this.opts.wobbleAmp;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const target = resolveTarget(i, frame);

      p.x += (target.x - p.x) * followLerp + Math.sin(now * 0.001 + p.phase) * wobbleAmp;
      p.y += (target.y - p.y) * followLerp + Math.cos(now * 0.0012 + p.phase) * wobbleAmp;

      if (repel) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const d2 = dx * dx + dy * dy;
        const r2 = repel.radius * repel.radius;
        if (d2 < r2) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / repel.radius) * repel.strength;
          p.x += (dx / d) * f;
          p.y += (dy / d) * f;
        }
      }

      this.drawParticle(ctx, p);
    }
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    ctx.fillStyle = p.accent ? this.colors.accent : this.colors.base;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
}
