// 問題ごとの OG 画像（1200x630）をビルド時に生成する（#123、#106 の子）。
//
// 方式: satori（React 風の要素ツリー → SVG）で SVG を組み立て、
// @resvg/resvg-js（Rust 製 resvg の Node バインディング）で PNG に
// ラスタライズする。どちらも外部サービス・ネットワークに依存しない
// ビルド時ローカル処理で完結する（#106 の受け入れ条件「生成はビルド時に
// 完結、実行時依存なし」）。
//
// フォント: 日本語タイトルを描画するには CJK グリフを持つフォントが
// 要る。Noto Sans JP 等を新たにリポジトリへバイナリで同梱すると
// リポジトリが重くなる上、実質同じ役割のフォントが二重管理になる。
// devcontainer には texlive-full 経由で HaranoAji（jlreq の既定 CJK
// フォント。styles/diary.sty の \gtfamily と同じ書体）が既に入っており
// （make pdf が依存する環境と同一）、`kpsewhich` で version 非依存に
// 実ファイルを解決できる。satori はフォントのグリフ輪郭を直接 SVG
// パスへ焼き込むため、後段の resvg 側は追加のフォント解決を必要としない。
//
// 数式は入れない（#106/#123 の指示どおり、タイトルの地の文のみ）。
// meta.title は formatMathTitle 済みの平文を渡すこと（呼び出し側で処理）。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** kpsewhich で見つかったフォントファイルのパスをキャッシュする候補名 */
const FONT_CANDIDATES = [
  { name: "HaranoAjiGothic-Bold.otf", weight: 700 as const },
  { name: "HaranoAjiGothic-Regular.otf", weight: 400 as const },
];

let cachedFonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;

function resolveFontPath(fileName: string): string | null {
  try {
    const out = execFileSync("kpsewhich", [fileName], { encoding: "utf-8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * OG 画像生成に使うフォントを解決して読み込む。
 * 見つからない場合は分かりやすいエラーを投げる（dist-content.ts の
 * assertDistExists と同方針。silent フォールバックにはしない）。
 */
function loadFonts() {
  if (cachedFonts) return cachedFonts;

  const fonts = FONT_CANDIDATES.map(({ name, weight }) => {
    const p = resolveFontPath(name);
    if (!p || !fs.existsSync(p)) return null;
    return { name: "HaranoAjiGothic", data: fs.readFileSync(p), weight, style: "normal" as const };
  }).filter((f): f is NonNullable<typeof f> => f !== null);

  if (fonts.length === 0) {
    throw new Error(
      "OG 画像生成用のフォント（HaranoAjiGothic-*.otf）が見つかりませんでした。\n" +
        "`kpsewhich HaranoAjiGothic-Bold.otf` で解決できる環境（texlive-full 導入済みの\n" +
        "devcontainer / CI イメージ）で `make build` を実行してください。"
    );
  }

  cachedFonts = fonts;
  return fonts;
}

export type OgImageInput = {
  id: string;
  /** formatMathTitle 済みの平文タイトル */
  title: string;
  fieldMajor: string;
  fieldMinor: string;
  difficulty: number;
};

/** difficulty（1〜5）のドット表現。0 はすべて非点灯にする。 */
function difficultyDots(difficulty: number): boolean[] {
  return Array.from({ length: 5 }, (_, i) => i < difficulty);
}

/**
 * 問題 1 件分の OG 画像を PNG（Buffer）として生成する。
 * satori → SVG → resvg → PNG の同期的な変換で完結する。
 */
export async function renderOgImagePng(input: OgImageInput): Promise<Buffer> {
  const fonts = loadFonts();
  const dots = difficultyDots(input.difficulty);

  // サイト本体のダーク基調（#05060a 背景 / #52e0f5 アクセント）を踏襲する
  // （site/src/pages/problems/[id]/index.astro の配色と揃える）。
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: `${OG_IMAGE_WIDTH}px`,
          height: `${OG_IMAGE_HEIGHT}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#05060a",
          color: "#dfe6ee",
          fontFamily: "HaranoAjiGothic",
        },
        children: [
          {
            type: "div",
            props: {
              style: { display: "flex", alignItems: "center", gap: "16px" },
              children: [
                {
                  type: "span",
                  props: {
                    style: { fontSize: "30px", fontWeight: 700, color: "#dfe6ee", letterSpacing: "0.02em" },
                    children: "Diary",
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { fontSize: "13px", color: "#768190", letterSpacing: "0.18em" },
                    children: "SELF-MADE MATHEMATICS",
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column", gap: "22px" },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "20px" },
                    children: [
                      {
                        type: "span",
                        props: {
                          style: { fontSize: "26px", color: "#52e0f5", letterSpacing: "0.02em" },
                          children: input.id,
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", alignItems: "center", gap: "6px" },
                          children: dots.map((on) => ({
                            type: "div",
                            props: {
                              style: {
                                width: "10px",
                                height: "10px",
                                borderRadius: "999px",
                                background: on ? "#52e0f5" : "#2a3340",
                              },
                            },
                          })),
                        },
                      },
                    ],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      fontSize: "56px",
                      fontWeight: 700,
                      lineHeight: 1.3,
                      maxWidth: "1000px",
                      // satori では CSS の line-clamp が使えないため、
                      // 4 行程度でおおよそ収まる長さに呼び出し側で丸めてから渡す。
                    },
                    children: input.title,
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "14px",
                fontSize: "22px",
                color: "#aeb6c2",
              },
              children: [
                { type: "span", props: { style: { color: "#52e0f5" }, children: input.fieldMajor } },
                { type: "span", props: { style: { color: "#768190" }, children: "/" } },
                { type: "span", props: { children: input.fieldMinor } },
              ],
            },
          },
        ],
      },
    },
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      fonts,
    }
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
  });
  return resvg.render().asPng();
}

/**
 * タイトルが長すぎて OG 画像内で崩れないよう、表示用に丸める。
 * 数式そのものは載せない方針（呼び出し側で formatMathTitle 済みの平文を
 * 渡す）なので、ここでは純粋に文字数で切るだけの単純な処理でよい。
 */
export function truncateForOgTitle(title: string, maxLength = 46): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1)}…`;
}
