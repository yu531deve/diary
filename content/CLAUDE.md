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
  major: "微分積分学"  # fields.yaml に存在する値のみ（理工系院試 8 分野。詳細は fields.yaml 参照）
  minor: "広義積分"    # fields.yaml に存在する値のみ
tags: ["面積"]         # tags.yaml に存在する値のみ。融合要素をここで表現
difficulty: 3         # 1-5。基準は docs/difficulty.md
created: 2026-08-04
updated: 2026-08-04   # 内容変更時に必ず更新
```

## 出題範囲

理工系大学院入試（工学・情報・物理系）を想定する。出題範囲は `fields.yaml` の
8 分野（微分積分学・線形代数・複素解析・常微分方程式・偏微分方程式・積分変換・
ベクトル解析・確率統計・数値解析と離散数学）を正とする。高校数学の単元名は使わない。
純粋数学系（集合と位相・代数学・測度論・関数解析・幾何学）は現時点の出題範囲に含めない。

## LaTeX 執筆ルール

- ドキュメントクラス・プリアンブルは書かない。本文のみ書く（ビルド側で `diary.sty` を適用）
- 数式・TikZ は自由に書いてよい。ただし `make lint` の禁止コマンドリストに違反した場合は修正する
- HTML 変換に失敗しても問題ない（PDF 埋め込みに自動フォールバックする）。ただし失敗が判明した場合は PR 本文に明記する
- TikZ 図は `problem.tex` / `solution.tex` 内に直接書く。ビルドが自動で SVG 化する
- 新しいタグ・分野が必要な場合は勝手に辞書へ追加せず、issue を立てる（保護ファイルのため）
- プリアンブルを書けない（`\usepackage` 禁止）ため、`diary.sty` が読み込む
  `amsmath` / `amssymb` / `bm` の範囲内で書く。それ以外のパッケージが要る表記は避け、
  代替が思いつかない場合は issue で相談する

### 大学以降の記法の書き方

- **ベクトル**: `\bm{x}`（`bm` パッケージ、太字イタリック。#167 で `diary.sty` に追加）を使う。
  `\boldsymbol{x}`（amsmath 提供）や矢印表記 `\vec{x}` でもよいが、1 問題内で統一する。
  `\mathbf{x}` は直立体の太字になり和書の慣習に反するため使わない
- **行列**: `pmatrix` / `bmatrix` 環境（amsmath 提供）を使う。成分表示は
  `A = (a_{ij})_{1 \le i,j \le n}` のように書く
- **作用素・関数名**: `\det`, `\dim`, `\ker`, `\rank`（`\operatorname{rank}` の短縮。
  `diary.sty` が提供。#167 で追加）のように、amsmath 標準の演算子コマンドまたは
  `\operatorname{...}` を使う
- **測度・積分**: ルベーグ積分・測度は `\int_E f \, \dd \mu` のように積分変数の
  直立体（`\dd x`。`\mathrm{d}x` の短縮、`diary.sty` が提供。#167 で追加）で書く。
  集合の記法は標準の `\in`, `\subset`, `\mathcal{F}` などで表す
- **集合・空間の記号**: 数の集合は `\mathbb{R}`, `\mathbb{C}`, `\mathbb{N}` のように
  `amssymb` の `\mathbb{}` を使う
- 上記の書き方で表現できない専用マクロ（例: `\vv{}` などの短縮コマンド）が
  欲しい場合は、`diary.sty` を変更せず issue を立てて提案する（本 issue の PR 本文にも
  提案を記載する）

## 禁止

- 他の問題ディレクトリへの変更（1 issue = 1 問題が原則）
- `status: published` の設定
- ID・ディレクトリ名の変更
