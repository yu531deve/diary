# CLAUDE.md — Diary プロジェクト憲法

自作入試数学問題を公開する静的サイト。原稿は LaTeX、成果物は HTML + PDF。
詳細仕様は `docs/requirements.md` を必ず先に読むこと。

## 不変条件（絶対に変更・違反してはならない）

1. **問題 ID は連番・不変**。振り直し禁止。欠番はそのまま残す
2. **URL 構造は不変**: `/problems/{id}/` `/solutions/{id}/`。分野再編で URL を変えない
3. **全 PDF にライセンス表記**（個人利用のみ許可）を焼き込む。sty 側で自動化されており、これを外さない
4. **`status: published` を勝手に付けない**。公開判断は Yu のみが行う
5. **既存問題の `.tex` を依頼なく整形・リファクタしない**

## ディレクトリと責務

```
content/    問題ソース（meta.yaml + problem.tex + solution.tex）
site/       静的サイトのコード
styles/     diary.sty ほか共通 LaTeX スタイル
lint/       linter（禁止コマンド・メタデータ・タグ辞書チェック)
docs/       要件定義・難易度基準などのドキュメント
.github/    CI 定義・issue テンプレート
```

## ビルドコマンド

```
make lint      # linter 一式
make pdf       # 変更のあった問題の PDF を差分ビルド
make html      # tex → HTML 変換（失敗時フォールバック確認込み）
make build     # 上記すべて + サイトビルド
make preview   # ローカルプレビュー
```

PR を出す前に `make build` がローカル（devcontainer 内）で通ることを必ず確認する。
「たぶん通る」での PR 提出は禁止。

## Definition of Done

問題・機能を問わず、以下 4 点が揃って完了:

1. `make lint` が通る
2. PDF（問題・解答）が生成される
3. HTML 変換が通る、またはフォールバックが正しく動作する
4. TikZ 図が SVG 化される（図がある場合）

## 並列作業ルール

- **保護ファイル**（変更 issue は単独で回す。並列 worktree から触らない）:
  - `styles/diary.sty`
  - `tags.yaml` / `fields.yaml`
  - `lint/` 配下
  - `.github/workflows/` 配下
  - `Makefile`
- main へのマージ後、他の worktree は**即 rebase**
- issue に「触ってはいけないファイル」が記載されている場合、それに従う

## ブランチ・PR 規約

- ブランチ名: `issue/{番号}-{短い説明}`（例: `issue/12-add-linter-tikz-check`)
- コミット: 1 コミット 1 論理変更。日本語可
- PR タイトル: `#{issue番号} 内容`。本文に「受け入れ条件をどう満たしたか」を明記
- PR は issue 1 件に対応。複数 issue をまとめない

## 禁止事項

- ID の振り直し・欠番の詰め直し
- `content/` 配下の一括整形
- 保護ファイルの並列変更
- linter を通すためのルール緩和（緩和が必要なら issue を立てて相談）
- 数式検索の実装を試みること（仕様として対象外）

## 執筆規約

`content/CLAUDE.md` を参照。サイト実装は `site/CLAUDE.md` を参照。
