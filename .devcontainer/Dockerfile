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
# TARGETARCH は buildx がプラットフォームごとに自動設定する(amd64/arm64)。
# #77: multi-arch(linux/amd64, linux/arm64)ビルドに対応するため、
# nodejs.org のアーカイブ名の arch 表記(x64/arm64)にマッピングする。
ARG NODE_VERSION=22.12.0
ARG TARGETARCH
# TARGETARCH は buildx / BuildKit が自動設定するが、レガシービルダー
# (DOCKER_BUILDKIT=0)では空になる。#175 の案内どおり手元で
# `docker build -t diary-devcontainer .devcontainer` を叩いたときに
# 「unsupported TARGETARCH: 」で落ちると原因が分かりにくいため、
# 空のときはビルドしている環境自身のアーキテクチャで補う。
RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${arch}" in \
      amd64) NODE_ARCH=x64 ;; \
      arm64) NODE_ARCH=arm64 ;; \
      *) echo "unsupported architecture: ${arch}" >&2; exit 1 ;; \
    esac \
    && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    && tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 \
    && rm "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    && node --version && npm --version

# ビルド検証(受け入れ条件のコマンドがイメージ内で通ることを保証)
# 注: LaTeXML のバージョン表示フラグは大文字の --VERSION（--version はヘルプ表示で exit 1）
RUN lualatex --version && latexml --VERSION && dvisvgm --version && node --version
