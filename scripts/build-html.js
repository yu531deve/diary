#!/usr/bin/env node
"use strict";

/**
 * content/ を走査し、status: published の問題ごとに
 * dist/html/{id}/problem.html と solution.html を LaTeXML で生成する。
 *
 * scripts/build-pdf.js と同様、content/ 配下の .tex は本文のみ
 * （documentclass なし）なので、ビルド側でラッパー .tex
 * （\documentclass + \usepackage[problem|solution]{diary} + \input{本文}）
 * を dist/html/.work/ 配下に動的生成して LaTeXML に渡す。
 * ラッパーはリポジトリにコミットしない中間ファイル。
 *
 * diary.sty（styles/diary.sty）は PDF 専用の実装（atbegshi の shipout
 * フック等）を含み、そのままでは LaTeXML が解釈できない。
 * そのため styles/diary.sty 本体には一切手を入れず、
 * scripts/latexml-bindings/diary.sty.ltxml という LaTeXML 専用の
 * バインディングを別途用意し、\diarytitle 等のマクロだけを
 * HTML 変換向けに再定義している（ライセンスフッターの焼き込みは
 * PDF 専用の仕組みのため HTML 側には移植しない）。
 *
 * TikZ（tikzpicture）は LaTeXML にそのまま処理させると壊れやすいため
 * （#22 で確認済み）、#23 で dvisvgm による事前生成に置き換えた。
 * 具体的には、LaTeXML に渡す本文コピー（content/ 配下の原本は変更しない）
 * の中で tikzpicture 環境をプレースホルダーの地の文に差し替え、
 * 抜き出した tikz ソースは別途 lualatex（DVI 出力）→ dvisvgm で
 * dist/html/{id}/fig-{n}.svg として生成する。LaTeXML の変換が終わった後、
 * 出力 HTML 内のプレースホルダーを <img src="fig-n.svg"> に置換する
 * （詳細は scripts/tikz-svg.js）。フォールバックは #24。
 *
 * 使い方:
 *   node scripts/build-html.js
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  extractTikzPictures,
  buildSvgsForId,
  replacePlaceholdersInHtml,
} = require("./tikz-svg");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(REPO_ROOT, "content");
const STYLES_DIR = path.join(REPO_ROOT, "styles");
const BINDINGS_DIR = path.join(REPO_ROOT, "scripts", "latexml-bindings");
const DIST_HTML_DIR = path.join(REPO_ROOT, "dist", "html");
const WORK_DIR = path.join(DIST_HTML_DIR, ".work");

const MODES = ["problem", "solution"];

// build-pdf.js と同じ簡易パーサー（meta.yaml は id / status 等の
// フラットなキーのみを使う想定）。
function parseSimpleMeta(raw) {
  const meta = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (key === "field") continue; // ネストは今回不要
    let value = rawValue.trim();
    value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    meta[key] = value;
  }
  return meta;
}

function findProblemDirs() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function buildWrapperTex(mode, svgStrippedBodyPath) {
  return [
    "\\documentclass[paper=a4]{jlreq}",
    `\\usepackage[${mode}]{diary}`,
    "\\begin{document}",
    `\\input{${svgStrippedBodyPath}}`,
    "\\end{document}",
    "",
  ].join("\n");
}

// id 単位で problem → solution の順に図番号を通番で振るためのカウンタ。
// 呼び出し側（main）が id ごとに { next: 1 } を渡す。
function convertOne(id, mode, bodyPath, failures, generated, figCounter) {
  const workDir = path.join(WORK_DIR, id, mode);
  fs.mkdirSync(workDir, { recursive: true });

  // tikzpicture を抽出し、LaTeXML に渡す本文コピーではプレースホルダーの
  // 地の文に差し替える（content/ 配下の原本は一切変更しない）。
  const bodyText = fs.readFileSync(bodyPath, "utf8");
  const { modifiedText, figures, nextIndex } = extractTikzPictures(
    bodyText,
    "fig",
    figCounter.next
  );
  figCounter.next = nextIndex;

  const svgStrippedBodyPath = path.join(workDir, "body.tex");
  fs.writeFileSync(svgStrippedBodyPath, modifiedText);

  const outDir = path.join(DIST_HTML_DIR, id);

  // 抽出した図を dvisvgm で SVG 化する（ハッシュキャッシュ付き）。
  if (figures.length > 0) {
    const svgWorkDir = path.join(WORK_DIR, id, "svg");
    const { failed } = buildSvgsForId(id, figures, outDir, svgWorkDir);
    if (failed.length > 0) {
      failures.push({ id, mode: `${mode}(svg)` });
      console.error(
        `[fail] ${id} ${mode}: SVG 生成に失敗した図があります (${failed.map((f) => f.name).join(", ")})`
      );
    }
  }

  const wrapperPath = path.join(workDir, "wrapper.tex");
  fs.writeFileSync(wrapperPath, buildWrapperTex(mode, svgStrippedBodyPath));

  const outPath = path.join(workDir, "out.html");

  try {
    execFileSync(
      "latexmlc",
      [
        `--path=${STYLES_DIR}`,
        `--path=${BINDINGS_DIR}`,
        "--format=html5",
        "--pmml", // MathML (Presentation) を出力に含める
        "--nodefaultresources",
        `--dest=${outPath}`,
        wrapperPath,
      ],
      {
        cwd: workDir,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (err) {
    // latexmlc が非 0 で終了した（=致命的エラー）場合はここに来る。
    failures.push({ id, mode });
    console.error(`[fail] ${id} ${mode}: latexmlc 変換失敗`);
    const log = err.stderr ? err.stderr.toString() : "";
    if (log) {
      console.error(log.split("\n").slice(-40).join("\n"));
    }
    return false;
  }

  if (!fs.existsSync(outPath)) {
    failures.push({ id, mode });
    console.error(`[fail] ${id} ${mode}: HTML が生成されませんでした`);
    return false;
  }

  let html = fs.readFileSync(outPath, "utf8");
  if (figures.length > 0) {
    html = replacePlaceholdersInHtml(html, figures);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const finalPath = path.join(outDir, `${mode}.html`);
  fs.writeFileSync(finalPath, html);
  generated.push(finalPath);
  console.log(`[ok] ${id} ${mode} -> ${path.relative(REPO_ROOT, finalPath)}`);
  return true;
}

function checkLatexmlAvailable() {
  try {
    execFileSync("latexmlc", ["--help"], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (err) {
    return false;
  }
}

function main() {
  if (!checkLatexmlAvailable()) {
    console.error(
      "[fatal] latexmlc が見つかりません。devcontainer（latexml パッケージ導入済み）で実行してください。"
    );
    process.exitCode = 1;
    return;
  }

  const ids = findProblemDirs();
  const failures = [];
  const generated = [];

  for (const id of ids) {
    const dir = path.join(CONTENT_DIR, id);
    const metaPath = path.join(dir, "meta.yaml");
    if (!fs.existsSync(metaPath)) {
      console.error(`[skip] ${id}: meta.yaml が見つかりません`);
      continue;
    }
    const meta = parseSimpleMeta(fs.readFileSync(metaPath, "utf8"));

    if (meta.status !== "published") {
      console.log(`[skip] ${id}: status=${meta.status || "(未設定)"}（draft はビルド対象外）`);
      continue;
    }

    const figCounter = { next: 1 };
    for (const mode of MODES) {
      const bodyPath = path.join(dir, `${mode}.tex`);
      if (!fs.existsSync(bodyPath)) {
        failures.push({ id, mode });
        console.error(`[fail] ${id} ${mode}: ${mode}.tex が見つかりません`);
        continue;
      }
      convertOne(id, mode, bodyPath, failures, generated, figCounter);
    }
  }

  console.log("");
  console.log(`生成された HTML: ${generated.length} 件`);
  for (const p of generated) {
    console.log(`  ${path.relative(REPO_ROOT, p)}`);
  }

  if (failures.length > 0) {
    console.error("");
    console.error("変換失敗:");
    for (const f of failures) {
      console.error(`  ${f.id} (${f.mode})`);
    }
    process.exitCode = 1;
  }
}

main();
