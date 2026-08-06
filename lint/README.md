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

## meta.yaml バリデーション

`content/**/meta.yaml` を走査し、docs/requirements.md §5 のスキーマに
違反していないかを検証する。

- **スキーマ検証**: 必須キー（`id` / `title` / `status` / `field.major` /
  `field.minor` / `tags` / `difficulty` / `created` / `updated`）の有無・型。
  `status` は `draft` / `published` のいずれか、`difficulty` は 1〜5 の
  整数、`created` / `updated` は `YYYY-MM-DD` 形式の実在する日付であること
- **辞書照合**: `field.major` / `field.minor` が `fields.yaml` に、
  `tags` の各要素が `tags.yaml` に存在すること
- **id 整合**: `id` がディレクトリ名と一致し、ゼロ埋め4桁の文字列であること

違反があれば stderr に `ファイル: キー: 理由` を1行1違反で出力し、exit 1
する。違反がなければ（走査対象が0件の場合を含む）exit 0。

`make lint` は `check-forbidden-commands.js` のみを呼ぶ単一コマンドで
構成されているため（Makefile は変更対象外）、`check-forbidden-commands.js`
が引数なしの通常走査時（= `make lint` 実行時）に限り `check-meta.js` を
まとめて呼び出す形にしている。fixture を指定して個別に実行したい場合や、
直接メタ検証だけ動かしたい場合は次のように単体実行できる。

```sh
# リポジトリルートから
node lint/check-meta.js

# 直接実行（fixtures など任意のファイルを指定する場合）
node lint/check-meta.js lint/fixtures/meta/ok/0001/meta.yaml
```

このバリデーションは M0-2 で作成された Python 版
（`lint/validate_meta.py`）を Node 実装へ統合したもの。検証内容
（必須キー・型・status 列挙・difficulty 範囲・日付形式・辞書照合・id
整合）はそのまま引き継ぎ、Python 版と旧サンプル（`lint/samples/`）は
削除して重複を残していない。

## 依存関係のインストール

`make lint` 実行時に `lint/node_modules` が無ければ自動的に
`npm ci --prefix lint` が走るため、通常は手動インストール不要。

手動で入れたい場合は次の通り。

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

`npm test`（`node lint/test/run-fixture-tests.js`）に続けて、
`node lint/test/run-meta-fixture-tests.js` も実行され、`check-meta.js` の
挙動を検証する。

- `fixtures/meta/ok/0001/meta.yaml`（正常系）が exit 0 になること
- `fixtures/meta/missing-key/` `bad-status/` `bad-difficulty/` `bad-date/`
  `bad-major/` `bad-minor/` `bad-tag/` `id-mismatch/` `id-not-zero-padded/`
  （それぞれ1種類の違反を含む）がすべて exit 1 になり、どのキーが何故
  ダメかを示すエラーメッセージが出力されること
- `fixtures/meta/` も `make lint` の通常走査対象（`content/**/meta.yaml`）
  には含まれない
