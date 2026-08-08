// sitemap.xml の生成（#119）。
// 対象は published 問題の /problems/{id}/ /solutions/{id}/ と、
// 静的ページ /, /fields/, /about/, /archive/。
// 問題一覧は listPublishedProblems()（dist-content.ts）を使い、
// content/ 配下からの実データ経路で生成する（ハードコード禁止）。
// draft はここで除外済み（status !== "published" は含まれない）。
//
// ベース URL は astro.config.mjs の `site`（暫定で
// https://diary-bo1.pages.dev、#103 のドメイン確定待ち）から取得する。
// URL を他所にハードコードしない。
import type { APIRoute } from "astro";
import { listPublishedProblems } from "../lib/dist-content";

export const prerender = true;

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error(
      "astro.config.mjs の site が未設定です。sitemap.xml は絶対 URL の生成に site を必要とします。"
    );
  }

  const staticPaths = ["/", "/fields/", "/about/", "/archive/"];
  const problems = listPublishedProblems();
  const problemPaths = problems.flatMap((p) => [
    `/problems/${p.id}/`,
    `/solutions/${p.id}/`,
  ]);

  const urls = [...staticPaths, ...problemPaths].map(
    (pathname) => new URL(pathname, site).toString()
  );

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((loc) => `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n  </url>`)
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
};
