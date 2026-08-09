.PHONY: lint pdf html build preview check

# GHCR 上の devcontainer イメージ名。.github/workflows/build.yml が
# pull しているものと同一（"CI と同じ検証" を成立させるための唯一の真実）。
# owner は git remote から動的に取り出す（フォーク等でも自然に追従する）。
CHECK_IMAGE_OWNER := $(shell git config --get remote.origin.url | sed 's/\.git//' | tr ':' '/' | rev | cut -d/ -f2 | rev | tr 'A-Z' 'a-z')
CHECK_IMAGE := ghcr.io/$(CHECK_IMAGE_OWNER)/diary-devcontainer:latest

# lint: content/**/*.tex の禁止コマンドチェックなど、linter 一式を実行する。
#       lint/node_modules が無い場合のみ npm ci --prefix lint を自動実行する
#       （order-only 依存。存在すれば再インストールせず高速に lint のみ走る）。
lint: | lint/node_modules
	node lint/check-forbidden-commands.js
	node lint/check-meta.js

lint/node_modules:
	npm ci --prefix lint

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

# check: 手元で CI(.github/workflows/build.yml)と同じ検証を回す(#171)。
#        build.yml は GHCR の devcontainer イメージを pull し、その中で
#        `make build` を実行しているだけなので、ここでも同じイメージを
#        pull して同じコマンドを実行する（既存の lint/pdf/html/build/preview
#        の挙動には一切手を入れない。check はそれらを"呼ぶだけ"の別ターゲット）。
#
#        docker が無い/イメージが pull できない環境（認証未設定など）では、
#        ホスト環境の `make build` にフォールバックする。その場合は CI と
#        ツールのバージョンが一致するとは限らないため、警告を出したうえで
#        ホスト側・イメージ側それぞれのツールバージョンを表示し、差分に
#        気づけるようにする。
check:
	@echo "=== ホスト環境のツールバージョン ==="
	-@lualatex --version 2>/dev/null | head -1 || echo "lualatex: not found on host"
	-@latexml --VERSION 2>/dev/null || echo "latexml: not found on host"
	-@dvisvgm --version 2>/dev/null | head -1 || echo "dvisvgm: not found on host"
	-@node --version 2>/dev/null | sed 's/^/node /' || echo "node: not found on host"
	@echo ""
	@if command -v docker >/dev/null 2>&1; then \
		echo "=== CI と同一の devcontainer イメージを取得: $(CHECK_IMAGE) ==="; \
		if docker pull $(CHECK_IMAGE); then \
			echo ""; \
			echo "=== イメージ内のツールバージョン(CI が実際に使っているもの) ==="; \
			docker run --rm $(CHECK_IMAGE) sh -c '\
				lualatex --version | head -1; \
				latexml --VERSION; \
				dvisvgm --version | head -1; \
				node --version'; \
			echo ""; \
			echo "=== devcontainer イメージ内で make build を実行(.github/workflows/build.yml と同一コマンド) ==="; \
			docker run --rm -v "$$(pwd):/workspace" -w /workspace $(CHECK_IMAGE) make build; \
		else \
			echo ""; \
			echo "WARNING: $(CHECK_IMAGE) の pull に失敗しました。"; \
			echo "         GHCR パッケージが private の場合は 'docker login ghcr.io' で認証してください。"; \
			echo "         ここではホスト環境で make build にフォールバックします"; \
			echo "         （CI とツールのバージョンが異なる可能性があります。上記のホスト側バージョンと"; \
			echo "          .devcontainer/Dockerfile を見比べて差分を確認してください）。"; \
			$(MAKE) build; \
		fi; \
	else \
		echo "WARNING: docker が見つかりません。"; \
		echo "         ホスト環境で make build にフォールバックします"; \
		echo "         （CI とツールのバージョンが異なる可能性があります。上記のホスト側バージョンと"; \
		echo "          .devcontainer/Dockerfile を見比べて差分を確認してください）。"; \
		$(MAKE) build; \
	fi
