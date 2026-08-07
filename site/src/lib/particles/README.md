# particles/ — 共通パーティクルエンジン

トップページのスクロール演出（`design/01_top_scroll.dc.html`）と初回ローディング演出
（`design/04_loading.dc.html`）が共有する canvas パーティクルエンジン。
どちらの演出も「ターゲット座標セットを作る → セット間を補間する → fillRect で描く」
という同じ骨格を持つため、その骨格だけをここに切り出している。

**このモジュールが持つもの**: ターゲット生成（`targets.ts`）、補間の数学（`interpolate.ts`）、
canvas 描画ループ（`engine.ts` の `ParticleEngine`）。
**持たないもの**: 「スクロール進捗をどう区間に割り当てるか」「delay をどう乱数生成するか」
といった演出固有の振り付け。これは各ページ側（`01_top_scroll` 相当・`04_loading` 相当の
Astro ページ）が本モジュールを組み合わせて書く。

支援ページ: `site/src/pages/dev/particles.astro`（開発時のみのデモ。全ターゲット種を確認できる）。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `targets.ts` | `textShape` / `curvePoints` / `randomScatter` / `upwardScatter` / `circleRim` / `alignSets` |
| `interpolate.ts` | `smoothstep` / `lerp` / `lerpPoint` / `segmentProgress`（区間テーブル補間）/ `delayedEase`（per-particle delay 補間） |
| `engine.ts` | `ParticleEngine`（canvas セットアップ・DPR・トレイル・fillRect 描画・マウス反発・reduced-motion） |
| `index.ts` | 上記の re-export |

## 基本の使い方

```ts
import {
  ParticleEngine,
  textShape,
  randomScatter,
  alignSets,
  segmentProgress,
  lerpPoint,
} from "../lib/particles";

const canvas = document.getElementById("fx") as HTMLCanvasElement;
const w = window.innerWidth;
const h = window.innerHeight;

// 1. ターゲットセットを作る
const scatter = randomScatter(1200, w, h);
const diary = textShape("Diary", { width: w, height: h, fontPx: 220, gap: 6, centerY: h * 0.42 });
const [setA, setB] = alignSets([scatter, diary]); // 短い方を周期的に埋めて同じ長さに揃える

// 2. エンジンを作る
const engine = new ParticleEngine(canvas, {
  mouseRepel: { radius: 120, strength: 5 }, // オプション。false で無効
});
engine.enableMouseTracking(); // マウス反発を使うページのみ
engine.setParticleCount(setA.length);

// 3. 毎フレームのターゲット解決関数を渡してループ開始
engine.start((i, frame) => {
  const p = /* 0〜1 の進捗を求める（スクロール量・経過時間など） */ 0.5;
  const { t } = segmentProgress(p, [[0, 1, 0, 1]]); // fromSetIndex=0 → toSetIndex=1
  return lerpPoint(setA[i], setB[i], t);
});
```

`ParticleEngine` は canvas に自動で `aria-hidden="true"` を付与する。

## `prefers-reduced-motion: reduce` への対応（必須）

`ParticleEngine` はコンストラクト時に `window.matchMedia('(prefers-reduced-motion: reduce)')`
を自動判定する（`reducedMotion` オプションで明示的に上書きも可能）。
`reducedMotion` が true のとき、`start()` はアニメーションループを開始せず、
渡した `resolveTarget` を 1 回だけ呼んで**最終ターゲット（静止形）を単発描画して終わる**。

そのため呼び出し側は分岐を書く必要がなく、常に「最終的に到達してほしいターゲット」を
返す `resolveTarget` を渡すだけでよい（例: トップページなら `p = 1` 相当の最終セット、
ローディングなら `raw = 1` 相当の収束後の文字形）。

```ts
// reduced-motion のときはこの resolveTarget が 1 回だけ呼ばれ、
// 常に最終形（setB）が返るので、それがそのまま静止画になる。
engine.start((i, frame) => {
  if (engine.reducedMotion) return setB[i];
  // 通常時のアニメーションロジック…
  return lerpPoint(setA[i], setB[i], progressToT(frame.now));
});
```

## 使用例 1: トップページのスクロール演出（design 01 相当）

```ts
import {
  ParticleEngine,
  textShape,
  curvePoints,
  randomScatter,
  upwardScatter,
  alignSets,
  segmentProgress,
  lerpPoint,
  type SegmentTable,
} from "../lib/particles";

const SEGMENTS: SegmentTable = [
  [0, 0.14, 0, 1],
  [0.14, 0.26, 1, 1],
  [0.26, 0.42, 1, 2],
  [0.42, 0.56, 2, 2],
  [0.56, 0.70, 2, 3],
  [0.70, 0.80, 3, 3],
  [0.80, 1.001, 3, 4],
];

function buildSets(w: number, h: number) {
  const scatter = randomScatter(2000, w, h);
  const diary = textShape("Diary", { width: w, height: h, fontPx: Math.min(w * 0.24, 340), centerY: h * 0.42 });
  const graph = curvePoints([
    { from: -2.2, to: 3.2, step: 0.018, fn: (u) => ({ x: sx(u), y: sy(u * u) }) },
    { from: -2.2, to: 3.2, step: 0.026, fn: (u) => ({ x: sx(u), y: sy(u + 2) }) },
  ]);
  const thousand = textShape("1000+", { width: w, height: h, fontPx: Math.min(w * 0.22, 300), centerY: h * 0.44 });
  const up = upwardScatter(2000, w, h);
  return alignSets([scatter, diary, graph, thousand, up]);
}

const sets = buildSets(window.innerWidth, window.innerHeight);
engine.setParticleCount(sets[0].length);
engine.start((i, frame) => {
  const p = getScrollProgress(); // track.getBoundingClientRect() から算出（ページ側の責務）
  const { from, to, t } = segmentProgress(p, SEGMENTS);
  return lerpPoint(sets[from][i], sets[to][i], t);
});
```

## 使用例 2: ローディング演出（design 04 相当、delay 付き収束）

```ts
import { ParticleEngine, textShape, circleRim, delayedEase, lerpPoint } from "../lib/particles";

const w = canvas.clientWidth, h = canvas.clientHeight;
const targets = textShape("Diary", { width: w, height: h, fontPx: Math.min(w * 0.2, 300), centerY: h * 0.46, gap: 5 });
const starts = circleRim(targets.length, { cx: w / 2, cy: h / 2, radius: Math.max(w, h) * 0.75 });
const delays = targets.map(() => Math.random() * 0.42);

const t0 = performance.now();
const DURATION = 3200;

engine.setParticleCount(targets.length);
engine.start((i, frame) => {
  const raw = engine.reducedMotion ? 1 : Math.min((frame.now - t0) / DURATION, 1);
  const e = delayedEase(raw, delays[i]); // smoothstep 済みの収束イージング
  return lerpPoint(starts[i], targets[i], e);
});
```

放出フェーズ（`raw > 0.86` からの吹き飛ばし演出）は、`resolveTarget` の戻り値に対して
呼び出し側で追加のオフセットを加えることで表現できる（`ParticleEngine` は座標を
そのまま受け取って追従させるだけなので、収束後の演出をどこまで作り込むかはページ側の自由）。

## API リファレンス

### `targets.ts`

- `textShape(text, opts): Point[]` — オフスクリーン canvas + `getImageData` によるグリッドサンプリング
- `curvePoints(segments): Point[]` — パラメトリックな区間の集合から点列を作る
- `randomScatter(count, width, height): Point[]`
- `upwardScatter(count, width, height, yMin?, yMax?): Point[]`
- `circleRim(count, { cx, cy, radius, radiusJitter? }): Point[]`
- `alignSet(set, n) / alignSets(sets, n?)` — セットの長さを揃える（短い方は周期的に繰り返す）

### `interpolate.ts`

- `smoothstep(t)` / `clamp01(t)` / `lerp(a,b,e)` / `lerpPoint(a,b,e)`
- `segmentProgress(p, table): { from, to, t }` — 単一の progress からセグメントを引く（`t` は smoothstep 済み）
- `delayedEase(raw, delay, span?, delayFactor?)` — パーティクルごとの delay を考慮した収束イージング（smoothstep 済み）

### `engine.ts` — `ParticleEngine`

```ts
new ParticleEngine(canvas: HTMLCanvasElement, options?: EngineOptions)
```

| オプション | 既定値 | 備考 |
|---|---|---|
| `trailColor` | `'rgba(5,6,10,0.34)'` | トレイルの半透明塗り |
| `dprMax` | `1.5` | `min(devicePixelRatio, dprMax)` |
| `colors.accent` / `colors.base` | シアン / 白系 | design トークン準拠 |
| `colors.accentRatio` | `0.16` | アクセント色の割合 |
| `sizeRange` | `[1.1, 2.5]` | fillRect のサイズ範囲 |
| `followLerp` | `0.09` | ターゲットへの追従係数 |
| `wobbleAmp` | `0.3` | 微振動の振幅 |
| `mouseRepel` | `false` | `{ radius: 120, strength: 5 }` で有効化 |
| `reducedMotion` | 自動判定 | 明示的に上書き可能 |
| `ariaHidden` | `true` | canvas に `aria-hidden="true"` を設定 |

主なメソッド:

- `setParticleCount(n, seed?)` — パーティクルプールを用意する
- `enableMouseTracking(target?)` / `disableMouseTracking(target?)`
- `start(resolveTarget, extraDraw?)` — 通常時はループ開始、reduced-motion 時は単発描画
- `stop()`
- `renderOnce(resolveTarget, extraDraw?)` — 静止形の単発描画を明示的に呼びたい場合
- `reducedMotion` — 現在の判定結果

`extraDraw?: (frame: FrameContext) => void` は、パーティクルを描く前に呼ばれる追加描画フック。
design 01 の「放物線と直線が囲む領域を塗る」ような演出固有の描画はここに書く。
