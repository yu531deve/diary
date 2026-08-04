# CLAUDE.md — 問題執筆規約

## ディレクトリ構造

```
content/{id}/
├── meta.yaml       # メタデータ（必須）
├── problem.tex     # 問題（必須）
└── solution.tex    # 解答・解説（必須）
```

`{id}` はゼロ埋め 4 桁の連番。新規作成時は既存最大値 +1。`/new-problem` コマンドで雛形を生成すること。

## meta.yaml スキーマ

```yaml
id: "0042"            # ディレクトリ名と一致必須
title: "問題タイトル"
status: draft         # draft | published（published は Yu のみが設定）
field:
  major: "微分積分"    # fields.yaml に存在する値のみ
  minor: "定積分"      # fields.yaml に存在する値のみ
tags: ["面積"]         # tags.yaml に存在する値のみ。融合要素をここで表現
difficulty: 3         # 1-5。基準は docs/difficulty.md
created: 2026-08-04
updated: 2026-08-04   # 内容変更時に必ず更新
```

## LaTeX 執筆ルール

- ドキュメントクラス・プリアンブルは書かない。本文のみ書く（ビルド側で `diary.sty` を適用）
- 数式・TikZ は自由に書いてよい。ただし `make lint` の禁止コマンドリストに違反した場合は修正する
- HTML 変換に失敗しても問題ない（PDF 埋め込みに自動フォールバックする）。ただし失敗が判明した場合は PR 本文に明記する
- TikZ 図は `problem.tex` / `solution.tex` 内に直接書く。ビルドが自動で SVG 化する
- 新しいタグ・分野が必要な場合は勝手に辞書へ追加せず、issue を立てる（保護ファイルのため）

## 禁止

- 他の問題ディレクトリへの変更（1 issue = 1 問題が原則）
- `status: published` の設定
- ID・ディレクトリ名の変更
