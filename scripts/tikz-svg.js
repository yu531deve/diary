"use strict";

/**
 * TikZ（tikzpicture 環境）を dvisvgm で SVG 化するモジュール（#23）。
 *
 * 要件（docs/requirements.md 決定 5）:
 *   TikZ → SVG 事前生成（ハッシュキャッシュ）。lualatex で DVI を作り、
 *   dvisvgm で SVG に変換する。
 *
 * 使い方（scripts/build-html.js から呼ばれる想定）:
 *   const { extractTikzPictures, buildSvgsForId } = require("./tikz-svg");
 *
 *   1. extractTikzPictures(bodyText) で本文中の \begin{tikzpicture}...
 *      \end{tikzpicture} をすべて抜き出し、抜き出した箇所を一意なプレース
 *      ホルダーテキストに置き換えた本文（LaTeXML 入力専用。content/ 配下の
 *      元ファイルは一切変更しない）と、図のソース一覧を返す。
 *   2. buildSvgsForId(...) で図ごとに standalone な .tex ファイルを作り、
 *      lualatex（--output-format=dvi）→ dvisvgm で
 *      dist/html/{id}/fig-{n}.svg を生成する。
 *      入力（tikz ソース + プリアンブル + styles/diary.sty の内容）から
 *      SHA-256 ハッシュを取り、.cache/svg-build-cache.json に前回のハッシュを
 *      記録して変更のない図は再生成をスキップする。
 *
 * HTML への差し替え（build-html.js 側の責務）:
 *   latexmlc の出力 HTML 内に残ったプレースホルダーテキストを、生成済み
 *   SVG への <img> 参照に正規表現で置換する。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const STYLES_DIR = path.join(REPO_ROOT, "styles");
const DIARY_STY_PATH = path.join(STYLES_DIR, "diary.sty");
const CACHE_DIR = path.join(REPO_ROOT, ".cache");
const CACHE_PATH = path.join(CACHE_DIR, "svg-build-cache.json");

// 本文中の tikzpicture を置き換えるプレースホルダーの接頭辞。
// LaTeXML が素通しできる、TeX 的に無害な単なる地の文（マクロではない）
// なので、ltxml バインディング側の変更は不要。
const PLACEHOLDER_PREFIX = "DIARYTIKZSVGPLACEHOLDER";

const TIKZ_RE = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;

/**
 * 本文テキストから tikzpicture 環境をすべて抽出し、プレースホルダーに
 * 置き換えた本文を返す。
 *
 * @param {string} bodyText content/{id}/{mode}.tex の内容
 * @param {string} figPrefix 図 ID の接頭辞（例: "fig"）。
 * @param {number} startIndex 採番開始番号（id 内で problem/solution 通番）
 * @returns {{ modifiedText: string, figures: Array<{name: string, source: string}> }}
 */
function extractTikzPictures(bodyText, figPrefix, startIndex) {
  const figures = [];
  let n = startIndex;
  const modifiedText = bodyText.replace(TIKZ_RE, (match) => {
    const name = `${figPrefix}-${n}`;
    n += 1;
    figures.push({ name, source: match });
    return `${PLACEHOLDER_PREFIX}(${name})`;
  });
  return { modifiedText, figures, nextIndex: n };
}

// diary.sty から \usetikzlibrary{...} 行を抜き出し、standalone 側の
// プリアンブルに反映する（diary.sty 本体は変更しない・参照のみ）。
function extractTikzLibraryLines(styContent) {
  const lines = [];
  const re = /\\usetikzlibrary\{[^}]*\}/g;
  let m;
  while ((m = re.exec(styContent))) {
    lines.push(m[0]);
  }
  return lines;
}

function buildStandaloneTex(tikzSource, libraryLines) {
  return [
    "\\documentclass{standalone}",
    "\\usepackage{tikz}",
    ...libraryLines,
    "\\begin{document}",
    tikzSource,
    "\\end{document}",
    "",
  ].join("\n");
}

function computeFigureHash(tikzSource, libraryLines, styContent) {
  const hash = crypto.createHash("sha256");
  hash.update("tikz:\n");
  hash.update(tikzSource);
  hash.update("\npreamble:\n");
  hash.update(libraryLines.join("\n"));
  hash.update("\ndiary.sty:\n");
  hash.update(styContent);
  return hash.digest("hex");
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch (err) {
    console.error(`[svg-cache] キャッシュファイルの読み込みに失敗したため無視します: ${err.message}`);
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

// macOS の Homebrew 版 dvisvgm は libgs（Ghostscript 共有ライブラリ）を
// 自力で見つけられないことがある（PostScript special が無視され、図が
// 壊れて出力される）。brew --prefix ghostscript から libgs.dylib を
// 探し、見つかれば --libgs= で明示的に渡す。Linux（devcontainer）では
// 通常 dvisvgm が Ghostscript を自動検出するため何もしない。
function findLibgsForMac() {
  if (process.platform !== "darwin") return null;
  try {
    const prefix = execFileSync("brew", ["--prefix", "ghostscript"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const libDir = path.join(prefix, "lib");
    if (!fs.existsSync(libDir)) return null;
    const candidate = fs
      .readdirSync(libDir)
      .find((f) => /^libgs\.dylib$/.test(f));
    return candidate ? path.join(libDir, candidate) : null;
  } catch (err) {
    return null;
  }
}

let cachedLibgsPath;
function getLibgsPath() {
  if (cachedLibgsPath === undefined) {
    cachedLibgsPath = findLibgsForMac();
  }
  return cachedLibgsPath;
}

/**
 * 1 個の tikzpicture を SVG に変換する（キャッシュ未使用時のみ呼ばれる）。
 * lualatex --output-format=dvi → dvisvgm。
 */
function renderSvg(tikzSource, libraryLines, workDir, name) {
  fs.mkdirSync(workDir, { recursive: true });
  const texPath = path.join(workDir, `${name}.tex`);
  fs.writeFileSync(texPath, buildStandaloneTex(tikzSource, libraryLines));

  execFileSync(
    "lualatex",
    [
      "--output-format=dvi",
      "-interaction=nonstopmode",
      "-halt-on-error",
      `-output-directory=${workDir}`,
      texPath,
    ],
    { cwd: workDir, stdio: ["ignore", "pipe", "pipe"] }
  );

  const dviPath = path.join(workDir, `${name}.dvi`);
  if (!fs.existsSync(dviPath)) {
    throw new Error(`DVI が生成されませんでした: ${dviPath}`);
  }

  const svgPath = path.join(workDir, `${name}.svg`);
  const dvisvgmArgs = ["--no-fonts", "-o", svgPath, dviPath];
  const libgs = getLibgsPath();
  if (libgs) {
    dvisvgmArgs.unshift(`--libgs=${libgs}`);
  }
  execFileSync("dvisvgm", dvisvgmArgs, {
    cwd: workDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!fs.existsSync(svgPath)) {
    throw new Error(`SVG が生成されませんでした: ${svgPath}`);
  }
  return svgPath;
}

/**
 * id 単位で図一覧を SVG 化し、dist/html/{id}/fig-{n}.svg として配置する。
 * キャッシュヒットした図は再生成しない。
 *
 * @param {string} id 問題番号
 * @param {Array<{name: string, source: string}>} figures extractTikzPictures の figures
 * @param {string} outDir dist/html/{id}
 * @param {string} workDirBase dist/html/.work/{id}/svg
 * @returns {{ built: string[], skipped: string[], failed: Array<{name: string, error: Error}> }}
 */
function buildSvgsForId(id, figures, outDir, workDirBase) {
  const styContent = fs.existsSync(DIARY_STY_PATH)
    ? fs.readFileSync(DIARY_STY_PATH, "utf8")
    : "";
  const libraryLines = extractTikzLibraryLines(styContent);

  const cache = loadCache();
  cache[id] = cache[id] || {};
  const idCache = cache[id];

  const built = [];
  const skipped = [];
  const failed = [];

  fs.mkdirSync(outDir, { recursive: true });

  for (const fig of figures) {
    const hash = computeFigureHash(fig.source, libraryLines, styContent);
    const svgOutPath = path.join(outDir, `${fig.name}.svg`);
    const prev = idCache[fig.name];

    if (prev && prev.hash === hash && fs.existsSync(svgOutPath)) {
      skipped.push(fig.name);
      console.log(`[svg-cache] ${id}/${fig.name}: 変更なし・スキップ`);
      continue;
    }

    try {
      const workDir = path.join(workDirBase, fig.name);
      const rendered = renderSvg(fig.source, libraryLines, workDir, fig.name);
      fs.copyFileSync(rendered, svgOutPath);
      idCache[fig.name] = { hash };
      built.push(fig.name);
      console.log(`[svg-ok] ${id}/${fig.name} -> ${path.relative(REPO_ROOT, svgOutPath)}`);
    } catch (err) {
      failed.push({ name: fig.name, error: err });
      console.error(`[svg-fail] ${id}/${fig.name}: ${err.message}`);
      const log = err.stderr ? err.stderr.toString() : "";
      if (log) {
        console.error(log.split("\n").slice(-30).join("\n"));
      }
    }
  }

  // 図が減った場合の孤立キャッシュエントリを掃除する。
  const currentNames = new Set(figures.map((f) => f.name));
  for (const name of Object.keys(idCache)) {
    if (!currentNames.has(name)) delete idCache[name];
  }

  saveCache(cache);

  return { built, skipped, failed };
}

/**
 * latexmlc が出力した HTML 内のプレースホルダーテキストを、生成済み SVG
 * への <img> 参照に置き換える。
 *
 * LaTeXML はプレースホルダーの地の文を <p class="ltx_p">...</p> 等の
 * 段落要素に包んで出力する。段落の中身がプレースホルダーだけの場合は
 * 段落ごと <img> に置き換え、そうでない場合（他のテキストと同居している
 * 稀なケース）はテキスト部分だけを <img> に置換する。
 */
function replacePlaceholdersInHtml(html, figures) {
  let result = html;
  for (const fig of figures) {
    const marker = `${PLACEHOLDER_PREFIX}(${fig.name})`;
    const imgTag = `<img src="${fig.name}.svg" alt="図（${fig.name}）" class="diary-figure" />`;

    // パターン1: 段落全体がプレースホルダーのみで構成される場合、
    // 段落タグごと <img> に置換する（前後の空白差異を許容）。
    const paraRe = new RegExp(
      `<p[^>]*class="[^"]*ltx_p[^"]*"[^>]*>\\s*${escapeRegExp(marker)}\\s*<\\/p>`
    );
    if (paraRe.test(result)) {
      result = result.replace(paraRe, imgTag);
      continue;
    }

    // パターン2: 段落タグが見つからない場合はテキストのみ置換する。
    result = result.split(marker).join(imgTag);
  }
  return result;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  extractTikzPictures,
  buildSvgsForId,
  replacePlaceholdersInHtml,
  PLACEHOLDER_PREFIX,
};
