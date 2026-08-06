// @ts-check
import { defineConfig } from "astro/config";

// dist/html・dist/pdf の取り込みは
// src/pages/problems/[id]/problem.pdf.ts と
// src/pages/problems/[id]/[fig].svg.ts の API ルートで行っている
// （`make preview` の astro dev でも同じ URL で動作させるため。
// astro:build:done でのファイルコピーは build 時にしか効かず不採用）。

// https://astro.build/config
export default defineConfig({});
