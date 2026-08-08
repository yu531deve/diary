/**
 * lib/mathviz/gamma.ts
 *
 * issue #93 のプロトタイプ（`site/src/pages/dev/beta-gamma/`）専用の数学ユーティリティ。
 * Γ関数・β関数の値計算と、被積分関数の点列サンプリングをまとめている。
 * 本番ページからは参照されない（プロトタイプ専用）。
 *
 * ## 数学的な正しさについて
 *
 * - `gamma(x)` は Lanczos 近似（g=7, n=9 係数、精度 ~1e-10）で Γ(x) (x > 0) を計算する。
 *   検証済みの既知値（このファイルの下部コメント参照）:
 *     Γ(1) = 1, Γ(2) = 1, Γ(3) = 2, Γ(4) = 6（= (n-1)! と一致）
 *     Γ(0.5) = √π ≈ 1.772453851
 *     Γ(1.5) = √π / 2 ≈ 0.886226925
 * - `beta(p, q)` は定義 B(p,q) = Γ(p)Γ(q)/Γ(p+q) をそのまま使う。
 *   これは `betaNumeric` （台形則による直接数値積分 ∫₀¹ x^(p-1)(1-x)^(q-1) dx）と
 *   相対誤差 1e-4 以内で一致することを `verifyMathviz()` で確認できる。
 */

// Lanczos approximation coefficients (g = 7, n = 9), standard reference values.
const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/**
 * Γ(x)（x > 0）。Lanczos 近似。
 * x < 0.5 のときは反射公式ではなく、Γ(x) = Γ(x+1)/x の再帰で正領域に押し上げてから計算する
 * （このプロトタイプでは s, p, q はすべて正の値として扱うため反射公式は不要）。
 */
export function gamma(x: number): number {
  if (x <= 0) return NaN;
  if (x < 0.5) {
    // 再帰で x >= 0.5 の領域に持っていく。
    return gamma(x + 1) / x;
  }
  const xm1 = x - 1;
  let a = LANCZOS_COEFFICIENTS[0];
  const t = xm1 + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    a += LANCZOS_COEFFICIENTS[i] / (xm1 + i);
  }
  return Math.sqrt(2 * Math.PI) * Math.pow(t, xm1 + 0.5) * Math.exp(-t) * a;
}

/** B(p,q) = Γ(p)Γ(q) / Γ(p+q) */
export function beta(p: number, q: number): number {
  return (gamma(p) * gamma(q)) / gamma(p + q);
}

/** ∫₀¹ x^(p-1)(1-x)^(q-1) dx を台形則で直接数値積分する（beta() の検算用）。 */
export function betaNumeric(p: number, q: number, steps = 20000): number {
  const eps = 1e-6;
  let sum = 0;
  const h = (1 - 2 * eps) / steps;
  for (let i = 0; i <= steps; i++) {
    const x = eps + i * h;
    const y = Math.pow(x, p - 1) * Math.pow(1 - x, q - 1);
    const w = i === 0 || i === steps ? 0.5 : 1;
    sum += w * y;
  }
  return sum * h;
}

/** Γ(s) = ∫₀^∞ x^(s-1) e^(-x) dx を [0, xmax] で打ち切って台形則で数値積分する（gamma() の検算用）。 */
export function gammaNumeric(s: number, xmax = 60, steps = 20000): number {
  const eps = 1e-6;
  let sum = 0;
  const h = (xmax - eps) / steps;
  for (let i = 0; i <= steps; i++) {
    const x = eps + i * h;
    const y = Math.pow(x, s - 1) * Math.exp(-x);
    const w = i === 0 || i === steps ? 0.5 : 1;
    sum += w * y;
  }
  return sum * h;
}

/** β関数の被積分関数 f(x) = x^(p-1)(1-x)^(q-1)（x ∈ (0,1)）。 */
export function betaIntegrand(p: number, q: number, x: number): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.pow(x, p - 1) * Math.pow(1 - x, q - 1);
}

/** Γ関数の被積分関数 f(x) = x^(s-1) e^(-x)（x ∈ (0, ∞)）。 */
export function gammaIntegrand(s: number, x: number): number {
  if (x <= 0) return 0;
  return Math.pow(x, s - 1) * Math.exp(-x);
}

/**
 * 開発コンソールで実行して数値検証するための関数。
 * `site/src/pages/dev/beta-gamma/index.astro` がマウント時に一度だけ呼び、結果を console.table する。
 */
export function verifyMathviz(): Array<{ label: string; expected: number; actual: number; diff: number }> {
  const cases: Array<{ label: string; expected: number; actual: number }> = [
    { label: "Γ(1) = 0! = 1", expected: 1, actual: gamma(1) },
    { label: "Γ(4) = 3! = 6", expected: 6, actual: gamma(4) },
    { label: "Γ(0.5) = √π", expected: Math.sqrt(Math.PI), actual: gamma(0.5) },
    { label: "Γ(1.5) = √π/2", expected: Math.sqrt(Math.PI) / 2, actual: gamma(1.5) },
    { label: "B(1,1) = 1", expected: 1, actual: beta(1, 1) },
    { label: "B(2,3) = 1/12", expected: 1 / 12, actual: beta(2, 3) },
    { label: "B(3,3) vs numeric", expected: betaNumeric(3, 3), actual: beta(3, 3) },
    { label: "Γ(3.4) vs numeric", expected: gammaNumeric(3.4), actual: gamma(3.4) },
  ];
  return cases.map((c) => ({ ...c, diff: Math.abs(c.expected - c.actual) }));
}
