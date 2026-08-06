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
 * キャッシュ（差分ビルド）は行わない（#21 で対応）。1 問の失敗は残りの
 * ビルドを止めず、最後に失敗一覧を stderr に出して exit 1 する。
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(REPO_ROOT, "content");
const STYLES_DIR = path.join(REPO_ROOT, "styles");
const DIST_PDF_DIR = path.join(REPO_ROOT, "dist", "pdf");
const WORK_DIR = path.join(DIST_PDF_DIR, ".work");

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
    return;
  }

  const producedPdf = path.join(workDir, "wrapper.pdf");
  if (!fs.existsSync(producedPdf)) {
    failures.push({ id, mode });
    console.error(`[fail] ${id} ${mode}: PDF が生成されませんでした`);
    return;
  }

  const outDir = path.join(DIST_PDF_DIR, id);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${mode}.pdf`);
  fs.copyFileSync(producedPdf, outPath);
  generated.push(outPath);
  console.log(`[ok] ${id} ${mode} -> ${path.relative(REPO_ROOT, outPath)}`);
}

function main() {
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

    for (const mode of MODES) {
      const bodyPath = path.join(dir, `${mode}.tex`);
      if (!fs.existsSync(bodyPath)) {
        failures.push({ id, mode });
        console.error(`[fail] ${id} ${mode}: ${mode}.tex が見つかりません`);
        continue;
      }
      compileOne(id, mode, bodyPath, failures, generated);
    }
  }

  console.log("");
  console.log(`生成された PDF: ${generated.length} 件`);
  for (const p of generated) {
    console.log(`  ${path.relative(REPO_ROOT, p)}`);
  }

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
