// /solutions/{id}/solution.pdf を dist/pdf/{id}/solution.pdf から配信する。
//
// problems/[id]/problem.pdf.ts と同じ理由で API ルートとして実装している
// （`make preview`（astro dev）でも同じ URL でそのまま動作させるため）。
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
  const pdfPath = path.join(DIST_PDF_DIR, id, "solution.pdf");
  if (!fs.existsSync(pdfPath)) {
    return new Response("Not found", { status: 404 });
  }
  const body = fs.readFileSync(pdfPath);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id}-solution.pdf"`,
    },
  });
};
