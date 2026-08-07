/**
 * particles/targets.ts
 *
 * ターゲット座標セット（パーティクルが向かう先の点群）の生成関数群。
 * design/01_top_scroll.dc.html・design/04_loading.dc.html の script 部分の
 * ロジックを、共通ライブラリとして切り出したもの。
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * 文字列をオフスクリーン canvas に描画し、alpha > 128 のピクセルを
 * グリッドサンプリングして点列にする（design 01 の `sampleText` / 04 の `build` 相当）。
 */
export interface TextShapeOptions {
  /** 描画先の想定サイズ（px） */
  width: number;
  height: number;
  /** フォントサイズ（px） */
  fontPx: number;
  /** CSS font-family 指定（例: `"Space Grotesk", sans-serif"`） */
  fontFamily?: string;
  /** font-weight */
  fontWeight?: number | string;
  /** サンプリング間隔（px）。小さいほど密。design の既定値は 5〜6px */
  gap?: number;
  /** テキストの中心 y 座標（省略時は height / 2） */
  centerY?: number;
  /** テキストの中心 x 座標（省略時は width / 2） */
  centerX?: number;
}

export function textShape(text: string, opts: TextShapeOptions): Point[] {
  const {
    width,
    height,
    fontPx,
    fontFamily = '"Space Grotesk", sans-serif',
    fontWeight = 700,
    gap = 6,
    centerY = height / 2,
    centerX = width / 2,
  } = opts;

  const oc = document.createElement("canvas");
  oc.width = Math.max(1, Math.round(width));
  oc.height = Math.max(1, Math.round(height));
  const og = oc.getContext("2d");
  if (!og) return [];

  og.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
  og.textAlign = "center";
  og.textBaseline = "middle";
  og.fillStyle = "#fff";
  og.fillText(text, centerX, centerY);

  const { data } = og.getImageData(0, 0, oc.width, oc.height);
  const pts: Point[] = [];
  for (let y = 0; y < oc.height; y += gap) {
    for (let x = 0; x < oc.width; x += gap) {
      if (data[(y * oc.width + x) * 4 + 3] > 128) {
        pts.push({ x, y });
      }
    }
  }
  return pts;
}

/**
 * パラメトリックな曲線・線分の点列を生成する（design 01 の `graph` 相当）。
 * 複数の区間（放物線・直線・軸など）をまとめて 1 つの点列として返す。
 *
 * 例:
 * ```ts
 * curvePoints([
 *   { from: -2.2, to: 3.2, step: 0.018, fn: (u) => ({ x: sx(u), y: sy(u * u) }) },
 *   { from: -2.2, to: 3.2, step: 0.026, fn: (u) => ({ x: sx(u), y: sy(u + 2) }) },
 * ])
 * ```
 */
export interface CurveSegment {
  from: number;
  to: number;
  step: number;
  fn: (t: number) => Point;
}

export function curvePoints(segments: CurveSegment[]): Point[] {
  const pts: Point[] = [];
  for (const { from, to, step, fn } of segments) {
    if (step <= 0) continue;
    for (let t = from; t <= to + 1e-9; t += step) {
      pts.push(fn(t));
    }
  }
  return pts;
}

/** 画面全体にランダム散乱する点列（design 01 セット0 相当）。 */
export function randomScatter(count: number, width: number, height: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({ x: Math.random() * width, y: Math.random() * height });
  }
  return pts;
}

/** y を [yMin, yMax] からランダムに取り、上方へ拡散させる点列（design 01 セット4 相当）。 */
export function upwardScatter(
  count: number,
  width: number,
  height: number,
  yMin = -height * 0.8,
  yMax = height,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({ x: Math.random() * width, y: yMin + Math.random() * (yMax - yMin) });
  }
  return pts;
}

/**
 * 円周付近にランダムに散らばる点列（design 04 のローディング開始位置相当）。
 * `radiusJitter` は半径の乱数係数レンジ（既定 [0.5, 1.4]、design 04 と同じ）。
 */
export interface CircleRimOptions {
  cx: number;
  cy: number;
  radius: number;
  radiusJitter?: [number, number];
}

export function circleRim(count: number, opts: CircleRimOptions): Point[] {
  const { cx, cy, radius, radiusJitter = [0.5, 1.4] } = opts;
  const [rMin, rMax] = radiusJitter;
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = radius * (rMin + Math.random() * (rMax - rMin));
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/**
 * ターゲットセットを長さ `n` に揃える（短ければ周期的に繰り返す = cycle）。
 * design 01 の `cyc(a, i) = a[i % a.length]` 相当。
 */
export function alignSet(set: Point[], n: number): Point[] {
  if (set.length === 0) return new Array(n).fill({ x: 0, y: 0 });
  const out: Point[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = set[i % set.length];
  return out;
}

/** 複数のターゲットセットを、最大長（または指定した n）に揃えて返す。 */
export function alignSets(sets: Point[][], n?: number): Point[][] {
  const target = n ?? Math.max(...sets.map((s) => s.length), 1);
  return sets.map((s) => alignSet(s, target));
}
