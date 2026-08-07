// ビルド時に生成する検索用軽量 JSON（#61）。
// id / title / field / sub / tags のみ。数式・地の文は含めない
// （数式検索は仕様外）。draft は buildSearchIndex 内部の
// listPublishedProblems で除外済み。
import type { APIRoute } from "astro";
import { buildSearchIndex } from "../lib/site-data";

export const prerender = true;

export const GET: APIRoute = () => {
  const index = buildSearchIndex();
  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
