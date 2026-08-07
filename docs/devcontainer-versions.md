# devcontainer 検証記録（M0-1）

- 検証日: 2026-08-05
- ホスト: macOS (Apple Silicon) + OrbStack / Docker Server 29.4.0
- イメージ: `.devcontainer/Dockerfile`（Debian bookworm-slim ベース、イメージサイズ 2.18GB）

## 受け入れ条件の検証結果

`docker build` が成功し、イメージ内で以下の出力を確認した。

| ツール | バージョン出力 |
|--------|----------------|
| lualatex | This is LuaHBTeX, Version 1.15.0 (TeX Live 2022/Debian) |
| latexml | latexml (LaTeXML version 0.8.7) |
| dvisvgm | dvisvgm 3.0.3 |
| node | v18.20.4 |
| npm | 9.2.0 |
| python3 | Python 3.11.2 |

## 検証中に得た知見

- LaTeXML のバージョン表示フラグは大文字の `--VERSION`（`--version` はヘルプ表示で exit 1）
- Debian bookworm では `dvisvgm` は texlive-extra-utils から分離された独立パッケージ。`--no-install-recommends` 併用時は明示インストールが必要
- texlive-full のダウンロードは数 GB。ホストの空き容量とビルド中のネットワーク断に注意

## CI イメージの事前ビルド化（#50）

`.github/workflows/build.yml` は devcontainer イメージを毎回 `docker build` せず、
GHCR (`ghcr.io/yu531deve/diary-devcontainer:latest`) から pull したイメージ上で
`make build` を実行する。イメージのビルド・push は `.github/workflows/image.yml` が
`.devcontainer/**` の変更を main に push した時のみ行う。

**初回セットアップ / イメージがまだ GHCR に無い場合**:

1. GitHub の Actions タブから `image` ワークフローを開き、`Run workflow`
   （`workflow_dispatch`）で main ブランチに対して 1 度手動実行する
2. 成功すると `ghcr.io/yu531deve/diary-devcontainer:latest` が push される
   （リポジトリの Packages に private パッケージとして表示される）
3. 以後は `build.yml` がそのイメージを pull するだけで動く

`.devcontainer/Dockerfile` を変更した PR をマージした後も、同様に main への push で
`image.yml` が自動的に再ビルド・push する（`paths: .devcontainer/**` トリガー）。
PR 作業中に最新版を試したい場合は、PR ブランチに対して `image.yml` を
`workflow_dispatch` で手動実行すれば良い（`latest` タグは上書きされる点に注意）。
