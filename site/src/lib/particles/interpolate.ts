/**
 * particles/interpolate.ts
 *
 * セット間補間のユーティリティ（smoothstep・区間テーブル・per-particle delay）。
 * design 01（スクロール進捗ベースの区間補間）と design 04（パーティクルごとの
 * delay を持つ収束アニメ）の両方から使えるように、汎用の関数として切り出した。
 */

import type { Point } from "./targets";

/** 3t² − 2t³ の smoothstep イージング。t は [0,1] にクランプされる。 */
export function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

export function clamp01(t: number): number {
  return Math.min(Math.max(t, 0), 1);
}

export function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

export function lerpPoint(a: Point, b: Point, e: number): Point {
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) };
}

/**
 * スクロール進捗のような単一の progress 値 `p`（0〜1）から、
 * 「どのセットからどのセットへ、どれだけ補間するか」を求める区間テーブル。
 * design 01 の `seg(p)` 相当。
 *
 * 区間は `[start, end, fromSetIndex, toSetIndex]` の配列で与える。
 * 最後の区間の `end` を超える `p` は、最後の区間の `toSetIndex` に固定される。
 */
export type SegmentTable = Array<[start: number, end: number, from: number, to: number]>;

export interface SegmentResult {
  from: number;
  to: number;
  /** smoothstep 適用後の区間内進捗（0〜1） */
  t: number;
}

export function segmentProgress(p: number, table: SegmentTable): SegmentResult {
  for (const [a, b, from, to] of table) {
    if (p >= a && p < b) {
      const raw = b === a ? 1 : (p - a) / (b - a);
      return { from, to, t: smoothstep(raw) };
    }
  }
  const last = table[table.length - 1];
  return { from: last ? last[3] : 0, to: last ? last[3] : 0, t: 1 };
}

/**
 * パーティクルごとに異なる delay を持たせた収束イージング（design 04 の
 * `local = clamp((raw - delay) / (span - delay*delayFactor), 0, 1)` を smoothstep したもの）。
 *
 * @param raw       全体の進捗（0〜1）
 * @param delay     このパーティクルの delay（0〜maxDelay 程度の乱数を想定）
 * @param span      delay=0 のパーティクルが収束にかける progress の幅（design 04 既定 0.62）
 * @param delayFactor delay が大きいパーティクルほど収束を素早くする係数（design 04 既定 0.4）
 */
export function delayedEase(raw: number, delay: number, span = 0.62, delayFactor = 0.4): number {
  const denom = span - delay * delayFactor;
  const local = denom <= 0 ? 1 : clamp01((raw - delay) / denom);
  return smoothstep(local);
}
