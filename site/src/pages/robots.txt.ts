// robots.txt の生成（#119）。/dev/ は Disallow にする（#79 で本番から
// 除外予定だが、それまでの保険）。sitemap の場所は astro.config.mjs の
// site（暫定 https://diary-bo1.pages.dev、#103 のドメイン確定待ち）から
// 絶対 URL を組み立てて示す。URL を他所にハードコードしない。
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error(
      "astro.config.mjs の site が未設定です。robots.txt は sitemap の絶対 URL の生成に site を必要とします。"
    );
  }

  const sitemapUrl = new URL("/sitemap.xml", site).toString();

  const body =
    `User-agent: *\n` + `Disallow: /dev/\n` + `\n` + `Sitemap: ${sitemapUrl}\n`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
};
