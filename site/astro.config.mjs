// @ts-check
import { defineConfig } from "astro/config";

// dist/html・dist/pdf の取り込みは
// src/pages/problems/[id]/problem.pdf.ts と
// src/pages/problems/[id]/[fig].svg.ts の API ルートで行っている
// （`make preview` の astro dev でも同じ URL で動作させるため。
// astro:build:done でのファイルコピーは build 時にしか効かず不採用）。

// 本番 URL（#119）。独自ドメインは未確定（#103）のため、暫定で現行の
// Cloudflare Pages の URL を使う。ドメイン確定時はここ 1 箇所を差し替える。
// sitemap.xml・robots.txt（src/pages/sitemap.xml.ts・robots.txt.ts）は
// この値から絶対 URL を組み立てているため、ハードコードした URL を
// 他所に増やさないこと。
export const SITE_URL = "https://diary-bo1.pages.dev";

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
});
