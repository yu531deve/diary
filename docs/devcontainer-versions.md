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
