// RSS フィード /feed.xml の生成（#120、#105 の子）。
// 対象は published 問題を created 降順に列挙し、タイトル・分野・
// 公開日・問題ページへの絶対 URL を含める。
// 問題一覧は listPublishedProblems()（dist-content.ts）を使い、
// content/ 配下からの実データ経路で生成する（ハードコード禁止）。
// draft はここで除外済み（status !== "published" は含まれない）。
//
// フォーマットは RSS 2.0 を採用（Atom ではなく）。
// 理由: サイト内に既に RSS 前提の説明文言・運用は無いが、フィード
// リーダー／クローラの互換性が広く、日付は RFC 822（pubDate）1 種類で
// 済むため実装・検証がシンプル。要件（タイトル・分野・公開日・絶対
// URL を含む新着フィード）を満たすのに Atom 固有の機能（id 分離や
// XHTML content 等）は不要と判断した。
//
// ベース URL は astro.config.mjs の `site`（暫定で
// https://diary-bo1.pages.dev、#103 のドメイン確定待ち）から取得する。
// URL を他所にハードコードしない。
import type { APIRoute } from "astro";
import { listPublishedProblems } from "../lib/dist-content";

export const prerender = true;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** meta.yaml の created（YYYY-MM-DD）を RFC 822 の pubDate 文字列に変換する。 */
function toPubDate(created: string): string | null {
  if (!created) return null;
  const date = new Date(`${created}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toUTCString();
}

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error(
      "astro.config.mjs の site が未設定です。feed.xml は絶対 URL の生成に site を必要とします。"
    );
  }

  const siteUrl = new URL("/", site).toString();
  const feedUrl = new URL("/feed.xml", site).toString();

  const problems = [...listPublishedProblems()].sort((a, b) =>
    b.created.localeCompare(a.created)
  );

  const items = problems.map((p) => {
    const link = new URL(`/problems/${p.id}/`, site).toString();
    const pubDate = toPubDate(p.created);
    const fieldLabel = [p.field.major, p.field.minor].filter(Boolean).join(" / ");
    return (
      `  <item>\n` +
      `    <title>${xmlEscape(p.title)}</title>\n` +
      `    <link>${xmlEscape(link)}</link>\n` +
      `    <guid isPermaLink="true">${xmlEscape(link)}</guid>\n` +
      (fieldLabel ? `    <category>${xmlEscape(fieldLabel)}</category>\n` : "") +
      (pubDate ? `    <pubDate>${pubDate}</pubDate>\n` : "") +
      `  </item>`
    );
  });

  const latestPubDate = problems
    .map((p) => toPubDate(p.created))
    .find((d): d is string => d !== null);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `  <title>Diary — 新着問題</title>\n` +
    `  <link>${xmlEscape(siteUrl)}</link>\n` +
    `  <description>Diary に公開された新着問題のフィードです。</description>\n` +
    `  <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />\n` +
    (latestPubDate ? `  <lastBuildDate>${latestPubDate}</lastBuildDate>\n` : "") +
    (items.length > 0 ? items.join("\n") + "\n" : "") +
    `</channel>\n` +
    `</rss>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml" },
  });
};
