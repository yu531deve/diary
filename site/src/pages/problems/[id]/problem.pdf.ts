// /problems/{id}/problem.pdf を dist/pdf/{id}/problem.pdf から配信する。
//
// astro:build:done フックでのファイルコピーではなく API ルートとして
// 実装しているのは、`make preview`（astro dev）でも同じ URL でそのまま
// 動作させるため。static output でもこのルートは getStaticPaths により
// ビルド時に静的ファイルとして書き出される。
import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { listPublishedProblems, DIST_PDF_DIR } from "../../../lib/dist-content";

export async function getStaticPaths() {
  return listPublishedProblems().map((meta) => ({
    params: { id: meta.id },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const id = params.id as string;
  const pdfPath = path.join(DIST_PDF_DIR, id, "problem.pdf");
  if (!fs.existsSync(pdfPath)) {
    return new Response("Not found", { status: 404 });
  }
  const body = fs.readFileSync(pdfPath);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id}-problem.pdf"`,
    },
  });
};
