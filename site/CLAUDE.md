# CLAUDE.md — サイト実装規約

## 要件（docs/requirements.md §6 の要約）

- ルーティング: `/problems/{id}/` `/solutions/{id}/` `/fields/{slug}/` は不変。変更禁止
- 解答ページは「解く前に見えない」導線（直接遷移時にワンクリック挟む）
- 全ページレスポンシブ。PC・モバイル両対応が必須（モバイル後回し禁止）
- 検索は Pagefind。対象はタイトル・タグ・地の文のみ。数式検索は仕様外
- 各問題ページに PDF ダウンロードリンクと誤植報告（GitHub Issue）リンク
- HTML 変換に失敗した問題は PDF 埋め込み表示に自動で切り替わること

## 実装方針

- 静的サイト生成。ビルド成果物のみを Cloudflare Pages にデプロイ
- 数式レンダリングは KaTeX（LaTeXML の出力を KaTeX で描画）
- クライアント JS は最小限。検索と解答表示トグル以外で重い JS を入れない
- 60fps を壊す装飾的アニメーションを勝手に追加しない

### 例外（Yu 裁定 2026-08-07・design/README.md 準拠）

- **トップページのみ**、スクロール駆動の canvas パーティクル演出(design/01_top_scroll)と初回ローディング演出(design/04_loading)を許可する。設計値は design/README.md の High-fidelity 指定に従う
- 例外の条件:
  - `prefers-reduced-motion: reduce` では演出を停止し、Diary の静止形のみ表示する(必須)
  - ローディングは sessionStorage により同一セッション再訪では表示しない(必須)
  - canvas には `aria-hidden="true"` を付け、テキストは通常の DOM で読ませる
  - モバイルのトップも `#track` のスクロール駆動演出をデスクトップと同じ仕組みで使う
    (Yu 指示 2026-08-08・#118。旧条項「モバイルはスクロール演出を使わず
    design/03_mobile の軽量版に差し替える」を上書きする)。ただし実機の発熱・fps を
    考慮し、パーティクル数と canvas の devicePixelRatio 上限はモバイルで下げて
    軽量化すること(実装は `site/src/pages/index.astro` 参照)
- **下層ページ(索引・問題・解答・About・検索)は本規約の原則どおり**: 重い JS 禁止・装飾アニメ禁止のまま。許可されるのは design/02 記載の軽量トランジション(hover、アコーディオン、ブラー開示)まで

### 実行時に生成する要素のスタイル（#250 / #254）

Astro のスコープ付き `<style>` は、セレクタに `data-astro-cid-*` を付けて出力する。
この属性は**テンプレートに書かれた要素にしか付かない**ため、
`document.createElement` などで実行時に生成した要素には**スタイルが一切当たらない**。

```css
/* NG: 生成要素には data-astro-cid が付かないので永久にマッチしない */
.save-row { ... }        → .save-row[data-astro-cid-xxx] { ... }
```

実行時に生成する要素へスタイルを当てるときは、次のどちらかにする。

```css
/* OK: テンプレートに存在する親の子孫として指定する（cid は親に付く） */
.save-list .save-row { ... }   → .save-list[data-astro-cid-xxx] .save-row { ... }

/* OK: 注入した HTML の中身には :global() を使う */
.answer-body :global(p) { ... } → .answer-body[data-astro-cid-xxx] p { ... }
```

**この不具合は見た目が素になるだけでエラーが出ないため気づきにくい。**
`/save/` では実際に一覧行のスタイルが全滅したまま本番に出ており、
レビューで指摘された修正が未マージのまま失われかけた（#250）。
実行時生成を書いたら、**ビルド後の CSS を grep してセレクタの形を確認すること。**

## 禁止

- URL 構造の変更
- 検索対象への数式の追加
- localStorage 等への依存を前提とした必須機能の実装
- 実行時に生成する要素のスタイルを、スコープ付き `<style>` に素のセレクタで書くこと（上記参照）
