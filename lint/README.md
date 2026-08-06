# lint/

Diary の linter 一式。実行言語は Node.js（devcontainer に同梱のもの）。

## 禁止コマンドチェック

`content/**/*.tex` を走査し、`forbidden-commands.yaml` に列挙された LaTeX
コマンドの使用を検出する。違反があれば stderr に
`ファイル:行番号: forbidden command \コマンド名` を1行1違反で出力し、exit 1 する。
違反がなければ（走査対象が0件の場合も含め）exit 0。

コメント行（`%` 以降。ただし `\%` はエスケープなので対象外）は検出対象外。

```sh
# リポジトリルートから
make lint

# 直接実行（fixtures など任意のファイルを指定する場合）
node lint/check-forbidden-commands.js lint/fixtures/ok.tex
```

禁止コマンドの定義は `forbidden-commands.yaml` にある。緩和・追加が必要な
場合はルールを直接変更せず、issue を立てて相談すること（CLAUDE.md 参照）。

## 依存関係のインストール

```sh
cd lint
npm install
```

（YAML パースに `js-yaml` のみを使用。`package-lock.json` をコミット済み）

## テスト

`lint/fixtures/` の正常系・異常系サンプルを使って動作確認する。

```sh
cd lint
npm test
# または
node lint/test/run-fixture-tests.js
```

このテストは以下を検証する:

- `fixtures/ok.tex`（禁止コマンドなし）が exit 0 になること
- `fixtures/write18.tex` / `input.tex` / `include.tex` / `usepackage.tex`
  （各禁止コマンドを1つずつ含む）がそれぞれ exit 1 になり、
  ファイル名・行番号・コマンド名を含むエラーが出力されること
- `\%` エスケープ後のコマンドも正しく検出されること

`fixtures/` は `make lint` の通常走査対象（`content/**/*.tex`）には含まれない。
