.PHONY: lint pdf html build preview

# lint: content/**/*.tex の禁止コマンドチェックなど、linter 一式を実行する。
lint:
	node lint/check-forbidden-commands.js

# pdf: content/ を走査し、status: published の問題ごとに
#      dist/pdf/{id}/problem.pdf・solution.pdf を生成する。
#      ソースハッシュ（problem.tex/solution.tex/meta.yaml/styles/diary.sty）
#      に変更のない問題は .cache/pdf-build-cache.json を見てスキップする。
pdf:
	node scripts/build-pdf.js

# html: content/ を走査し、status: published の問題ごとに
#       LaTeXML（latexmlc）で dist/html/{id}/problem.html・solution.html
#       を生成する（#22。フォールバックは #24 で追加予定）。
html:
	node scripts/build-html.js

# preview: site/ の Astro 開発サーバーをローカルで起動する（トップページ仮実装のみ）。
preview:
	cd site && npm install && npm run dev

# 以下は将来追加予定（未実装）:
# build:    lint + pdf + html + サイトビルドをまとめて実行する
