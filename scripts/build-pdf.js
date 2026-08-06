#!/usr/bin/env node
"use strict";

/**
 * content/ を走査し、status: published の問題ごとに
 * dist/pdf/{id}/problem.pdf と dist/pdf/{id}/solution.pdf を生成する。
 *
 * content/ 配下の .tex は本文のみ（documentclass なし）なので、
 * ビルド側でラッパー .tex（\documentclass + \usepackage[problem|solution]{diary}
 * + \input{本文}）を dist/pdf/.work/ 配下に動的生成してコンパイルする。
 * ラッパーはリポジトリにコミットしない中間ファイル。
 *
 * 使い方:
 *   node scripts/build-pdf.js
 *
 * 差分ビルド（#21）:
 *   問題ごとに problem.tex / solution.tex / meta.yaml / styles/diary.sty
 *   の内容から SHA-256 ハッシュを計算し、.cache/pdf-build-cache.json に
 *   前回成功時のハッシュを記録する。ハッシュが一致し、かつ前回ビルドが
 *   成功していた問題はスキップする。前回失敗した問題はハッシュが
 *   一致していてもスキップしない（失敗を成功として記録しない）。
 *   diary.sty の内容もハッシュに含めるため、sty の変更は全問の
 *   再ビルドを引き起こす（意図した挙動）。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(REPO_ROOT, "content");
const STYLES_DIR = path.join(REPO_ROOT, "styles");
const DIARY_STY_PATH = path.join(STYLES_DIR, "diary.sty");
const DIST_PDF_DIR = path.join(REPO_ROOT, "dist", "pdf");
const WORK_DIR = path.join(DIST_PDF_DIR, ".work");
const CACHE_DIR = path.join(REPO_ROOT, ".cache");
const CACHE_PATH = path.join(CACHE_DIR, "pdf-build-cache.json");

const MODES = ["problem", "solution"];

// meta.yaml は単純なフラット構造（+ field の 1 段ネスト）のみを使うため、
// js-yaml 等の依存を追加せず、必要なキー（id / status）だけを
// 手書きパーサーで拾う。フォーマットが崩れている場合は例外を投げる。
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

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch (err) {
    console.error(`[cache] キャッシュファイルの読み込みに失敗したため無視します: ${err.message}`);
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

// 問題 1 件分のハッシュ: problem.tex + solution.tex + meta.yaml + diary.sty
// の内容を連結して SHA-256 を取る。styles/diary.sty が変われば全問の
// ハッシュが変化し、全問再ビルドとなる。
function computeHash(id, dir, styContent) {
  const hash = crypto.createHash("sha256");
  hash.update(`id:${id}\n`);
  for (const name of ["problem.tex", "solution.tex", "meta.yaml"]) {
    const p = path.join(dir, name);
    const content = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.from("");
    hash.update(`${name}:\n`);
    hash.update(content);
    hash.update("\n");
  }
  hash.update("diary.sty:\n");
  hash.update(styContent);
  return hash.digest("hex");
}

function buildWrapperTex(id, mode, bodyPath) {
  return [
    "\\documentclass[paper=a4]{jlreq}",
    `\\usepackage[${mode}]{diary}`,
    "\\begin{document}",
    `\\input{${bodyPath}}`,
    "\\end{document}",
    "",
  ].join("\n");
}

function compileOne(id, mode, bodyPath, failures, generated) {
  const workDir = path.join(WORK_DIR, id, mode);
  fs.mkdirSync(workDir, { recursive: true });
  const wrapperPath = path.join(workDir, "wrapper.tex");
  fs.writeFileSync(wrapperPath, buildWrapperTex(id, mode, bodyPath));

  const texinputs = `${STYLES_DIR}${path.delimiter}${process.env.TEXINPUTS || ""}`;

  try {
    execFileSync(
      "lualatex",
      [
        "-interaction=nonstopmode",
        "-halt-on-error",
        `-output-directory=${workDir}`,
        wrapperPath,
      ],
      {
        cwd: workDir,
        env: { ...process.env, TEXINPUTS: texinputs },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (err) {
    failures.push({ id, mode });
    console.error(`[fail] ${id} ${mode}: lualatex コンパイル失敗`);
    const log = err.stdout ? err.stdout.toString() : "";
    if (log) {
      console.error(log.split("\n").slice(-40).join("\n"));
    }
    return false;
  }

  const producedPdf = path.join(workDir, "wrapper.pdf");
  if (!fs.existsSync(producedPdf)) {
    failures.push({ id, mode });
    console.error(`[fail] ${id} ${mode}: PDF が生成されませんでした`);
    return false;
  }

  const outDir = path.join(DIST_PDF_DIR, id);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${mode}.pdf`);
  fs.copyFileSync(producedPdf, outPath);
  generated.push(outPath);
  console.log(`[ok] ${id} ${mode} -> ${path.relative(REPO_ROOT, outPath)}`);
  return true;
}

function main() {
  const ids = findProblemDirs();
  const failures = [];
  const generated = [];
  const skipped = [];

  const cache = loadCache();
  const styContent = fs.existsSync(DIARY_STY_PATH)
    ? fs.readFileSync(DIARY_STY_PATH)
    : Buffer.from("");
  const nextCache = {};

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

    const hash = computeHash(id, dir, styContent);
    const prev = cache[id];

    let useCache = false;
    if (prev && prev.hash === hash && prev.success === true) {
      const problemPdf = path.join(DIST_PDF_DIR, id, "problem.pdf");
      const solutionPdf = path.join(DIST_PDF_DIR, id, "solution.pdf");
      if (fs.existsSync(problemPdf) && fs.existsSync(solutionPdf)) {
        console.log(`[cache] ${id}: 変更なし・スキップ`);
        skipped.push(id);
        nextCache[id] = prev;
        useCache = true;
      } else {
        console.log(`[cache] ${id}: PDF 出力が見つからないため再ビルドします`);
      }
    } else if (prev && prev.hash === hash && prev.success === false) {
      console.log(`[cache] ${id}: ハッシュ一致だが前回ビルド失敗のため再ビルドします`);
    } else if (prev) {
      console.log(`[cache] ${id}: 変更を検出・再ビルドします`);
    } else {
      console.log(`[cache] ${id}: 初回ビルドします`);
    }

    if (useCache) continue;

    let idSuccess = true;
    for (const mode of MODES) {
      const bodyPath = path.join(dir, `${mode}.tex`);
      if (!fs.existsSync(bodyPath)) {
        failures.push({ id, mode });
        console.error(`[fail] ${id} ${mode}: ${mode}.tex が見つかりません`);
        idSuccess = false;
        continue;
      }
      const ok = compileOne(id, mode, bodyPath, failures, generated);
      if (!ok) idSuccess = false;
    }

    nextCache[id] = { hash, success: idSuccess };
  }

  saveCache(nextCache);

  console.log("");
  console.log(`生成された PDF: ${generated.length} 件`);
  for (const p of generated) {
    console.log(`  ${path.relative(REPO_ROOT, p)}`);
  }
  console.log(`スキップされた問題: ${skipped.length} 件`);

  if (failures.length > 0) {
    console.error("");
    console.error("ビルド失敗:");
    for (const f of failures) {
      console.error(`  ${f.id} (${f.mode})`);
    }
    process.exitCode = 1;
  }
}

main();
