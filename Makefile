.PHONY: lint pdf html build preview

# lint: content/**/*.tex の禁止コマンドチェックなど、linter 一式を実行する。
lint:
	node lint/check-forbidden-commands.js

# 以下は将来追加予定（未実装）:
# pdf:      変更のあった問題の PDF を差分ビルドする
# html:     tex → HTML 変換（失敗時フォールバック確認込み）を行う
# build:    lint + pdf + html + サイトビルドをまとめて実行する
# preview:  ローカルプレビューサーバーを起動する
