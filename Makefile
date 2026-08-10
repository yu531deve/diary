.PHONY: lint pdf html build preview check check-node-drift

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
# check-node-drift: 「今このコマンドを実行している環境」の Node メジャー
#       バージョンが .devcontainer/Dockerfile の ARG NODE_VERSION と一致するか
#       確認する（#175）。
#
#       背景: #171 の check は docker pull で "CI と同一のイメージ" 上で
#       make build を検証できるが、実際に事故ったのは devcontainer に
#       入って直接 `make build` 等を叩く経路だった。ローカルにキャッシュ
#       された devcontainer イメージ（VS Code の Dev Containers 拡張などが
#       ビルド・キャッシュする、GHCR とは別物のイメージ）が Dockerfile
#       更新後も再ビルドされずに残っていると、Node だけ古いままいつまでも
#       気づけない。
#
#       docker を経由せず「今動いている node コマンド」を直接見ることで、
#       devcontainer 内実行でも、docker が使えない環境でも同じロジックで
#       検出できる。Dockerfile 自体（CI が使う唯一の真実）から期待値を
#       毎回読み取るので、Node のバージョンを上げた際もこのチェック側は
#       変更不要。
#
#       重要: これは「devcontainer の中に入って作業しているのに、その
#       コンテナが古い」ことを検出するためのものであり、ホストの Node
#       バージョンとは無関係（ホストは開発機なので Node 22 とは限らない。
#       `make check` はどのみち GHCR から正しいイメージを pull してその
#       中で make build するため、ホストの Node は結果に影響しない）。
#       そのため /.dockerenv の有無でコンテナ内かどうかを判定し、
#       コンテナ内でのみ食い違いを致命的エラーとして扱う。ホストでは
#       警告のみに留め、`make check` を止めない。
#
#       texlive-full 内の lualatex/latexml/dvisvgm は Dockerfile 側で
#       バージョンを固定していない（apt のバージョンに追従）ため、
#       同様の突き合わせは行えない。ここは Node のみを対象とする。
check-node-drift:
	@expected=$$(grep -oE '^ARG NODE_VERSION=[0-9]+' .devcontainer/Dockerfile | cut -d= -f2); \
	if [ -z "$$expected" ]; then \
		echo "WARNING: .devcontainer/Dockerfile から NODE_VERSION を読み取れませんでした。チェックをスキップします。"; \
		exit 0; \
	fi; \
	if ! command -v node >/dev/null 2>&1; then \
		echo "WARNING: node が見つかりません。Node バージョンの整合性チェックをスキップします。"; \
		exit 0; \
	fi; \
	actual=$$(node --version | sed -E 's/^v([0-9]+).*/\1/'); \
	if [ "$$actual" = "$$expected" ]; then \
		echo "OK: Node $$(node --version) は .devcontainer/Dockerfile の指定(v$$expected.x)と一致しています。"; \
		exit 0; \
	fi; \
	msg="今の環境の Node メジャーバージョンが .devcontainer/Dockerfile と食い違っています。\n\
       今の環境: Node $$(node --version)\n\
       Dockerfile が指定: Node $$expected.x (.devcontainer/Dockerfile の ARG NODE_VERSION)\n\
\n\
       ローカルにキャッシュされた devcontainer イメージが古い可能性があります。\n\
       再ビルドしてください:\n\
         VS Code Dev Containers 拡張を使っている場合:\n\
           コマンドパレット → 'Dev Containers: Rebuild Container'\n\
         手動で docker build している場合:\n\
           docker build --no-cache -t diary-devcontainer .devcontainer"; \
	if [ -f /.dockerenv ]; then \
		echo "ERROR: $$msg"; \
		exit 1; \
	else \
		echo "WARNING(ホストのため非致命的。devcontainer 内でこの食い違いが出ている場合のみ要対応): $$msg"; \
		exit 0; \
	fi

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
#
#        まず check-node-drift で「今の実行環境」自体が Dockerfile と
#        食い違っていないかを確認する（#175）。ホストでは警告のみ
#        （exit 0）で、devcontainer 内で食い違っている場合のみ
#        致命的エラーとしてここで止まる。
check: check-node-drift
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
