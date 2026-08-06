.PHONY: lint pdf html build preview

# lint: content/**/*.tex の禁止コマンドチェックなど、linter 一式を実行する。
lint:
	node lint/check-forbidden-commands.js

# pdf: content/ を走査し、status: published の問題ごとに
#      dist/pdf/{id}/problem.pdf・solution.pdf をフルビルドする。
#      差分ビルド（キャッシュ）は #21 で対応する。
pdf:
	node scripts/build-pdf.js

# 以下は将来追加予定（未実装）:
# html:     tex → HTML 変換（失敗時フォールバック確認込み）を行う
# build:    lint + pdf + html + サイトビルドをまとめて実行する
# preview:  ローカルプレビューサーバーを起動する
