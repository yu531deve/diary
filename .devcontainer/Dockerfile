# Diary ビルド環境: TeX Live + LaTeXML + dvisvgm + Node
# Debian bookworm のパッケージに固定することで全 worktree・CI の環境を揃える。
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    # TeX Live(lualatex / dvisvgm を含むフルセット。日本語組版に haranoaji 等も入る)
    texlive-full \
    # bookworm では dvisvgm は独立パッケージ(--no-install-recommends だと texlive-full だけでは入らない)
    dvisvgm \
    # tex → HTML 変換
    latexml \
    # サイトビルド・ツール類
    nodejs \
    npm \
    make \
    git \
    ca-certificates \
    python3 \
    python3-yaml \
    && rm -rf /var/lib/apt/lists/*

# ビルド検証(受け入れ条件のコマンドがイメージ内で通ることを保証)
# 注: LaTeXML のバージョン表示フラグは大文字の --VERSION（--version はヘルプ表示で exit 1）
RUN lualatex --version && latexml --VERSION && dvisvgm --version && node --version
