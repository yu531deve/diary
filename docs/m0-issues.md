# M0 issue リスト（直列・並列禁止）

M0 の目的: **サンプル 1 問が「lint → PDF → HTML → SVG → サイト表示」まで一気通貫で通る**状態を作る。
これが通るまで worktree の並列実行は禁止。以下は依存順。

## M0-1: devcontainer（TeX Live 環境固定）

- `.devcontainer/` に TeX Live + LaTeXML + dvisvgm + Node を含むイメージ定義
- 全 worktree・CI が同一環境でビルドできることが M0 全体の前提
- 受け入れ条件: devcontainer 内で `lualatex --version` `latexml --version` `dvisvgm --version` が通る

## M0-2: メタデータスキーマと辞書の初版

- `meta.yaml` スキーマ定義（docs/requirements.md §5 準拠）
- `fields.yaml`（大分野 > 中分野の初版辞書）と `tags.yaml`（空でよい）
- `docs/difficulty.md` の雛形（基準文は Yu が記入）
- 受け入れ条件: スキーマのバリデーションスクリプトがサンプル meta.yaml を通す

## M0-3: diary.sty 初版

- 問題用・解答用の共通スタイル
- **ライセンス表記のフッター自動焼き込み**を含む
- 受け入れ条件: 本文のみの .tex + diary.sty で PDF がコンパイルできる

## M0-4: linter 骨格

- 禁止コマンドリスト（初版は最小でよい）チェック
- meta.yaml バリデーション（M0-2 のスクリプトを統合）
- タグ・分野の辞書照合
- 受け入れ条件: `make lint` が正常系・異常系サンプルで期待通りの exit code を返す

## M0-5: サンプル問題 0001

- TikZ 図を**あえて含む**問題を 1 問作成（図パイプラインの検証のため）
- problem.tex / solution.tex / meta.yaml（status: published）
- 受け入れ条件: `make lint` が通る

## M0-6: PDF ビルドパイプライン

- 1 問 PDF（問題・解答）の生成
- ソースハッシュによる差分ビルド（キャッシュ）
- 受け入れ条件: 0001 の問題 PDF・解答 PDF が生成され、フッターにライセンス表記がある。2 回目のビルドがキャッシュヒットでスキップされる

## M0-7: HTML 変換パイプライン

- LaTeXML による tex → HTML 変換
- TikZ の dvisvgm による SVG 事前生成（ハッシュキャッシュ）
- **変換失敗時の PDF 埋め込みフォールバック機構**
- 受け入れ条件: 0001 が HTML 化され図が SVG で表示される。意図的に変換不能な .tex を与えるとフォールバックが発動する

## M0-8: サイト最小版

- トップ（仮）・`/problems/0001/`・`/solutions/0001/` の 3 ページ
- KaTeX レンダリング、PDF ダウンロードリンク、解答ワンクリックガード
- 受け入れ条件: `make preview` で 3 ページが PC・モバイル幅の両方で表示できる

## M0-9: CI 統合と Cloudflare Pages デプロイ

- push 時: lint + 差分 PDF + HTML + サイトビルド
- Pages への自動デプロイ
- 受け入れ条件: main への push でサイトが公開 URL に反映される

## M0-10: inshi sparse checkout 連携

- Diary の CI が inshi の問題ディレクトリを sparse checkout して content 相当として取り込む
- 受け入れ条件: inshi 側に置いたサンプル問題（published）がビルドに含まれ、draft は含まれない

---

M0 完了後、M1 で並列解禁。M1 の主な内容: 分冊 PDF（夜間バッチ）、Pagefind 検索、分野索引ページ、kagakudai_inshi からの既存問題移行、誤植報告導線。
