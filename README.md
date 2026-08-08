# Diary — 自作入試数学問題集

自作の大学入試数学問題を公開する静的サイト。原稿は LaTeX、成果物は Web ページ(HTML)と印刷用 PDF。

**▶ サイト: https://diary-bo1.pages.dev/**

- [分野から探す](https://diary-bo1.pages.dev/fields/)
- [サンプル問題 0001](https://diary-bo1.pages.dev/problems/0001/)
- [About](https://diary-bo1.pages.dev/about/)

## 特徴

- **完全自作**: 過去問の転載は一切なし。目標 1000 問
- **Web + PDF**: ブラウザで読み、印刷用 PDF(解答欄付き)で解ける
- **解答の段階開示**: 解く前に答えが見えない導線(ブラー + ワンクリック開示)
- **LaTeX が Single Source of Truth**: 1 つの `.tex` から PDF(lualatex)と HTML(LaTeXML + MathML)を生成。TikZ 図は dvisvgm で SVG 化

## 仕組み

```
content/{id}/          meta.yaml + problem.tex + solution.tex(本文のみ)
        │
        ├─ lint     禁止コマンド・メタデータ・分野/タグ辞書チェック
        ├─ pdf      lualatex + styles/diary.sty(ライセンス表記を自動焼き込み)
        ├─ html     LaTeXML → MathML。TikZ は dvisvgm で SVG(失敗時は PDF 埋め込みへ自動フォールバック)
        └─ site     Astro。ビルド成果物を Cloudflare Pages へ自動デプロイ
```

- ビルドはソースハッシュによる差分ビルド(1 問変更の CI は数分)
- CI は devcontainer と同一イメージ(GHCR)で実行し、環境差を排除

## 開発

devcontainer(TeX Live + LaTeXML + dvisvgm + Node)内で:

```
make lint      # linter 一式
make pdf       # 問題・解答 PDF の差分ビルド
make html      # HTML 変換(フォールバック込み)
make build     # 上記すべて + サイトビルド
make preview   # ローカルプレビュー(http://localhost:4321)
```

運用ルールは [CLAUDE.md](CLAUDE.md)、要件定義は [docs/requirements.md](docs/requirements.md)、難易度基準は [docs/difficulty.md](docs/difficulty.md) を参照。

## ライセンス

- コード(site/ や scripts/ など): [MIT](LICENSE)
- 問題コンテンツ(content/ と生成物): **個人利用のみ許可**。再配布・商用利用・教育機関等での配布・改変物の公開は禁止 — [content/LICENSE.md](content/LICENSE.md)

## 誤植・不備の報告

[GitHub Issue](https://github.com/yu531deve/diary/issues) へ。問題番号を添えてもらえると助かります。
