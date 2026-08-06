// /solutions/{id}/fig-N.svg を dist/html/{id}/fig-N.svg から配信する。
// problems/[id]/[fig].svg.ts と同じ理由・同じ dist/html/{id} ディレクトリを
// 参照する（問題と解答の図は同じソースディレクトリから生成されるため）。
import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { listPublishedProblems, DIST_HTML_DIR } from "../../../lib/dist-content";

export async function getStaticPaths() {
  const paths: { params: { id: string; fig: string } }[] = [];
  for (const meta of listPublishedProblems()) {
    const dir = path.join(DIST_HTML_DIR, meta.id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^fig-.*\.svg$/i.test(f)) {
        paths.push({
          params: { id: meta.id, fig: f.replace(/\.svg$/i, "") },
        });
      }
    }
  }
  return paths;
}

export const GET: APIRoute = ({ params }) => {
  const id = params.id as string;
  const fig = params.fig as string;
  const svgPath = path.join(DIST_HTML_DIR, id, `${fig}.svg`);
  if (!fs.existsSync(svgPath)) {
    return new Response("Not found", { status: 404 });
  }
  const body = fs.readFileSync(svgPath);
  return new Response(body, {
    headers: { "Content-Type": "image/svg+xml" },
  });
};
