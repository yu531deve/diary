# CLAUDE.md — サイト実装規約

## 要件（docs/requirements.md §6 の要約）

- ルーティング: `/problems/{id}/` `/solutions/{id}/` `/fields/{major}/` は不変。変更禁止
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
  - モバイルのトップはスクロール演出を使わず design/03_mobile の軽量版に差し替える
- **下層ページ(索引・問題・解答・About・検索)は本規約の原則どおり**: 重い JS 禁止・装飾アニメ禁止のまま。許可されるのは design/02 記載の軽量トランジション(hover、アコーディオン、ブラー開示)まで

## 禁止

- URL 構造の変更
- 検索対象への数式の追加
- localStorage 等への依存を前提とした必須機能の実装
