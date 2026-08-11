// 難易度バッジの表示ロジック共通化（#131、親 #107）。
//
// 段階数（5）・各段階のラベルは docs/difficulty.md v2.0（#166、知識の深さ ×
// 発想の要求度の 2 軸）の基準表と一致させている。表示ラベルは基準文の要約であり、
// docs/difficulty.md の表を改定した場合はこの一覧も同時に更新すること
// （DIFFICULTY_LEVELS がサイト全体の唯一の参照元。各ページ・コンポーネントに
// 段階数や文言を直接ハードコードしないこと）。
//
// site/src/components/DifficultyBadge.astro（Astro テンプレートで描画するページ用）
// と、⌘K 検索モーダル（SearchModal.astro）・/save/ 一覧（save/index.astro）のように
// クライアント JS で DOM を実行時生成するページの両方から、この 1 ファイルの値・
// 関数だけを参照する。

export const DIFFICULTY_MAX = 5;

export type DifficultyLevel = { n: number; label: string };

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
	{ n: 1, label: "学部教養の定義・定理をそのまま当てはめれば解ける" },
	{ n: 2, label: "学部教養〜専門科目の定石を1〜2個、素直に適用すれば解ける" },
	{ n: 3, label: "標準的な院試の専門科目。複数の定石を自分で組み立てる必要がある" },
	{ n: 4, label: "発展的・複数分野にまたがる内容。非自明な着眼が要る。上位層でも部分点どまり" },
	{ n: 5, label: "最難関の院試レベル。複数の非自明な着眼が要る。捨て問判断も戦略のうち" },
];

/** About ページの難易度基準セクションへのリンク先（バッジからの導線用）。 */
export const DIFFICULTY_LEGEND_HREF = "/about/#difficulty";

/** meta.yaml の `difficulty`（文字列）を 0〜DIFFICULTY_MAX の整数に正規化する。 */
export function difficultyNum(difficulty: string | number | undefined | null): number {
	const n = typeof difficulty === "number" ? difficulty : parseInt(String(difficulty ?? ""), 10);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(DIFFICULTY_MAX, n));
}

/** ドット表示（●●●○○ のような）用の on/off 配列。長さは常に DIFFICULTY_MAX。 */
export function difficultyDots(difficulty: string | number | undefined | null): boolean[] {
	const n = difficultyNum(difficulty);
	return Array.from({ length: DIFFICULTY_MAX }, (_, i) => i < n);
}

/** その段階の説明文（DIFFICULTY_LEVELS から引く）。該当なしは空文字。 */
export function difficultyLabel(difficulty: string | number | undefined | null): string {
	const n = difficultyNum(difficulty);
	return DIFFICULTY_LEVELS.find((d) => d.n === n)?.label ?? "";
}

/** バッジの title / aria-label に使う説明文（"難易度 3 / 5: ..."）。 */
export function difficultyDescription(difficulty: string | number | undefined | null): string {
	const n = difficultyNum(difficulty);
	const label = difficultyLabel(difficulty);
	return label ? `難易度 ${n} / ${DIFFICULTY_MAX}: ${label}` : `難易度 ${n || "—"} / ${DIFFICULTY_MAX}`;
}

/**
 * クライアント JS で実行時に DOM を組み立てるページ（⌘K 検索・/save/）向け。
 * DifficultyBadge.astro と同じクラス名・構造（.difficulty-badge > .dots + .num）
 * で要素を作るため、CSS は該当ページ側の is:global ブロックに同じセレクタで
 * 用意すること（site/CLAUDE.md「実行時に生成する要素のスタイル」参照）。
 */
export function createDifficultyBadgeElement(
	difficulty: string | number | undefined | null,
	compact = true
): HTMLElement {
	const n = difficultyNum(difficulty);
	const desc = difficultyDescription(difficulty);

	const el = document.createElement("span");
	el.className = compact ? "difficulty-badge compact" : "difficulty-badge";
	el.title = desc;
	el.setAttribute("aria-label", desc);

	const dotsEl = document.createElement("span");
	dotsEl.className = "dots";
	dotsEl.setAttribute("aria-hidden", "true");
	for (const on of difficultyDots(difficulty)) {
		const dot = document.createElement("span");
		if (on) dot.className = "on";
		dotsEl.appendChild(dot);
	}

	const numEl = document.createElement("span");
	numEl.className = "num";
	numEl.textContent = String(n || "—");

	el.append(dotsEl, numEl);
	return el;
}
