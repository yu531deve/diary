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

# preview: site/ の Astro 開発サーバーをローカルで起動する。
preview:
	cd site && npm install && npm run dev

# build: lint → pdf → html → サイトビルドを直列実行する（#27）。
#        make は既定でターゲットごとに新しいシェルを起動し、いずれかの
#        コマンドが非ゼロで終了すればそこで即座に停止する（-e 相当）ため、
#        依存関係の列挙だけで「途中失敗で即 exit 非ゼロ」が満たされる。
#        サイトのビルドは dist/pdf・dist/html の生成物に依存する
#        （site/src/lib/dist-content.ts）ため、必ずこの順序を保つ。
build: lint pdf html
	cd site && npm ci && npm run build
