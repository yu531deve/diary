# Diary 要件定義書

- 版: v1.0（初版）
- 日付: 2026-08-04
- 状態: 承認待ち（Yu の最終確認をもって確定）

---

## 1. プロジェクト概要

自作の大学入試数学問題を Web 上で公開し、PDF としてもダウンロードできる静的サイト「Diary」を構築する。

- **原稿**: LaTeX (.tex) を Single Source of Truth とする
- **成果物**: HTML ページ（Web 閲覧）+ PDF（LaTeX コンパイルによる本格組版）
- **想定利用者**: 受験生
- **目標規模**: 1000 問以上
- **公開方針**: 完全自作問題のみ。作成した問題から選別して公開

## 2. 決定事項一覧

| # | 項目 | 決定 |
|---|------|------|
| 1 | 原稿形式 | LaTeX (.tex) |
| 2 | PDF 生成 | TeX Live による CI コンパイル（本格組版） |
| 3 | Web 表示 | tex → HTML 変換（LaTeXML）を本命。失敗時は PDF 埋め込みに自動フォールバック |
| 4 | 書式の担保 | 規約で縛らず、CI の linter で禁止コマンドをチェック |
| 5 | 図 | TikZ を図形分野中心に使用。CI で dvisvgm により SVG 事前生成 |
| 6 | 解答・解説 | 問題とは別ページ・別 PDF |
| 7 | ID 体系 | 意味を持たせない連番のみ（例: `0042`）。不変 |
| 8 | URL 構造 | `/problems/{id}/` と `/solutions/{id}/`。分野再編でも URL 不変 |
| 9 | 分野 | 階層（大分野 > 中分野、2 層まで）+ 補助タグ。タグは `tags.yaml` の辞書で管理し linter で強制 |
| 10 | 難易度 | 5 段階の数値。各段階の基準文をリポジトリに置く |
| 11 | 下書き管理 | メタデータの `status: draft / published` で管理。`draft` はビルド対象外 |
| 12 | リポジトリ | Diary 専用リポジトリを新設。`kagakudai_inshi` は畳み、作成済み問題のみ初回移行 |
| 13 | inshi 連携 | ファイル複製なし。Diary の CI が `inshi` を sparse checkout してビルド時に読む |
| 14 | PDF 粒度 | 1 問ごと PDF + 中分野ごとの分冊 PDF の両方 |
| 15 | 分冊ビルド | 1 問 PDF は push ごとの差分ビルド。分冊は夜間バッチまたはタグ契機 |
| 16 | 検索 | Pagefind による全文検索。対象はタイトル・タグ・地の文（数式は対象外と明記） |
| 17 | モバイル | PC・モバイル両方をしっかり作る |
| 18 | ライセンス | 個人利用のみ許可。PDF フッターに表記を焼き込む（sty で自動化） |
| 19 | ホスティング | Cloudflare Pages |
| 20 | 想定解答時間 | メタデータへの追加は保留（後から検討） |

## 3. 未決事項

- サイト名「Diary」の最終確定と、トップページ構成（分野別索引が主か、時系列フィードか）
- ドメイン
- 難易度 5 段階の基準文の中身（`docs/difficulty.md` に雛形あり、要記入）
- 想定解答時間メタデータの要否
- 誤植報告の導線の詳細（GitHub Issue リンクを最有力とする）

## 4. システム構成

```
inshi リポジトリ（.tex の実体、status 付き）
        │ sparse checkout（ビルド時に読むだけ、複製なし）
        ▼
Diary リポジトリ（サイトコード + CI + sty + linter）
        │ CI
        ├── linter: 禁止コマンド・メタデータ・タグ辞書チェック
        ├── TeX Live: 問題 PDF / 解答 PDF（1 問ごと、差分ビルド）
        ├── dvisvgm: TikZ → SVG 事前生成（ハッシュキャッシュ）
        ├── LaTeXML: tex → HTML（失敗時 PDF 埋め込みへフォールバック）
        ├── 分冊 PDF: 中分野ごと（夜間バッチ / タグ契機）
        └── Pagefind: 検索インデックス生成
        ▼
Cloudflare Pages（静的配信）
```

### 制約・リスク

- LaTeXML は任意の LaTeX を変換できない。フォールバック機構によりビルドは止めない設計とする
- Cloudflare Pages はデプロイあたり 20,000 ファイル上限。1000 問時点で約 5,000 と試算。3,000 問超で PDF の R2 退避を検討
- inshi 側にも Diary のメタデータ規約・linter が波及する（避けられないコスト）
- 数式は全文検索の対象外。仕様として明記する

## 5. メタデータスキーマ（v1）

各問題ディレクトリに `meta.yaml` を置く。

```yaml
id: "0042"            # 連番・不変・ゼロ埋め 4 桁
title: "定積分と面積の融合問題"
status: draft         # draft | published
field:
  major: "微分積分"    # fields.yaml の辞書に存在すること
  minor: "定積分"
tags: ["面積", "融合問題"]   # tags.yaml の辞書に存在すること
difficulty: 3         # 1-5（docs/difficulty.md の基準に従う）
created: 2026-08-04
updated: 2026-08-04
```

ディレクトリ構造:

```
content/
└── 0042/
    ├── meta.yaml
    ├── problem.tex     # 問題
    └── solution.tex    # 解答・解説
```

## 6. 機能要件

### Web
- トップページ（構成は未決。分野別索引を有力とする）
- 分野別索引 `/fields/{major}/`（中分野で更に絞り込み可）
- 問題ページ `/problems/{id}/`（HTML 表示、PDF ダウンロードリンク、解答ページへのリンク）
- 解答ページ `/solutions/{id}/`（問題を解く前に解答が見えない導線。ワンクリック挟む）
- タグ・難易度による絞り込み
- 全文検索（Pagefind）
- 各問題ページに誤植報告リンク（GitHub Issue）
- レスポンシブ対応（PC・モバイル両対応）

### PDF
- 1 問 PDF（問題・解答それぞれ）
- 中分野ごとの分冊 PDF
- 全 PDF のフッターにライセンス表記（個人利用のみ許可）を自動で焼き込む

## 7. 非機能要件

- ビルド: 差分ビルド必須。1 問変更時の CI は数分以内に完了すること
- 図: TikZ の SVG 化はソースハッシュでキャッシュ
- 検索インデックス: 1000 問で数 MB 程度を想定
- ライセンス: CC BY-NC-ND 相当（個人利用のみ）。教育機関による配布は許可しない

## 8. 開発体制・プロセス

- Orca (IDE) で main を Fable 5 が監視
- worktree を作成し、Sonnet に issue を 1 件ずつ担当させる
- PR レビュー: Fable / マージ: Yu
- マイルストーンを 2 段に分ける
  - **M0（直列・並列禁止）**: 基盤構築。スキーマ確定、`diary.sty` 初版、linter 骨格、devcontainer（TeX Live 固定）、CI、サンプル 1 問が PDF・HTML 両方で出るまで
  - **M1 以降（並列解禁）**: issue 大量投入、worktree 並列
- 共通ファイル（`styles/diary.sty`, `tags.yaml`, `fields.yaml`, linter 設定, CI 定義）は保護ファイルとし、変更 issue は単独で回す
- マージ後、他の worktree は即 rebase
- issue は `.github/ISSUE_TEMPLATE/` のテンプレートに従う（変更対象ファイル・受け入れ条件・触ってはいけないファイルを必須項目とする）

### Definition of Done（問題追加の完了条件）

1. linter が通る
2. PDF（問題・解答）が生成される
3. HTML 変換が通る（またはフォールバックが正しく機能する）
4. TikZ 図が SVG 化される
