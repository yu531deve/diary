/**
 * issue #152: 横スクロールする数式領域をキーボードで操作可能にする。
 *
 * axe-core の scrollable-region-focusable 対策。横に長い数式は
 * `overflow-x: auto` で個別にスクロール領域化しているが、それだけでは
 * Safari 等でキーボードのみのユーザーがスクロール操作できない。
 *
 * 全ての数式要素に tabindex="0" を振るとタブ移動が過剰になるため、
 * 実際に横スクロールが発生している要素（scrollWidth > clientWidth）
 * にだけ tabindex="0" と aria-label を付与する。
 */
export function markScrollableMath(root: ParentNode, selector: string): void {
	const candidates = root.querySelectorAll<HTMLElement>(selector);
	for (const el of candidates) {
		const isScrollable = el.scrollWidth > el.clientWidth;
		if (isScrollable) {
			if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
			if (!el.hasAttribute("role")) el.setAttribute("role", "group");
			if (!el.hasAttribute("aria-label")) {
				el.setAttribute("aria-label", "数式（横スクロール可能）");
			}
			el.setAttribute("data-scroll-focusable", "1");
		} else if (el.getAttribute("data-scroll-focusable") === "1") {
			// レイアウト変化（幅の拡大など）で非スクロールに戻った場合は元に戻す
			el.removeAttribute("tabindex");
			el.removeAttribute("role");
			el.removeAttribute("aria-label");
			el.removeAttribute("data-scroll-focusable");
		}
	}
}
