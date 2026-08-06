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
    # ツール類
    make \
    git \
    ca-certificates \
    curl \
    xz-utils \
    python3 \
    python3-yaml \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22(Astro 7 が >=22.12.0 を要求。bookworm の nodejs は 18 のため
# nodejs.org の公式バイナリをバージョン固定で導入する)
ARG NODE_VERSION=22.12.0
RUN curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1 \
    && rm "node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && node --version && npm --version

# ビルド検証(受け入れ条件のコマンドがイメージ内で通ることを保証)
# 注: LaTeXML のバージョン表示フラグは大文字の --VERSION（--version はヘルプ表示で exit 1）
RUN lualatex --version && latexml --VERSION && dvisvgm --version && node --version
