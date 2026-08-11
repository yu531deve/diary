// /problems/{id}/og.png — 問題ごとの OG 画像（#123、#106 の子issue）。
//
// problem.pdf.ts / [fig].svg.ts と同じ方針で API ルート（getStaticPaths
// を持つ APIRoute）として実装する。理由も同じ:
//   - `make preview`（astro dev）でも同一 URL で動作させたい
//   - static output でも getStaticPaths によりビルド時に静的ファイルとして
//     書き出される
//
// 問題ページ・解答ページの両方からこの 1 枚を参照する（og-image.ts 参照。
// 解答ページに解答内容を出すものではなく、単なる識別カードのため
// 問題ページと共用して問題ない）。
import type { APIRoute } from "astro";
import { listPublishedProblems } from "../../../lib/dist-content";
import { formatMathTitle } from "../../../lib/title";
import { renderOgImagePng, truncateForOgTitle } from "../../../lib/og-image";

export async function getStaticPaths() {
  return listPublishedProblems().map((meta) => ({
    params: { id: meta.id },
    props: { meta },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const meta = props.meta as ReturnType<typeof listPublishedProblems>[number];
  const difficultyNum = Number(meta.difficulty) || 0;

  const png = await renderOgImagePng({
    id: meta.id,
    title: truncateForOgTitle(formatMathTitle(meta.title)),
    fieldMajor: meta.field.major,
    fieldMinor: meta.field.minor,
    difficulty: difficultyNum,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
