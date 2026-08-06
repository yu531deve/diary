#!/usr/bin/env node
"use strict";

/**
 * #24 の HTML フォールバック機構の自動テスト。
 * content/ には触れず、scripts/fixtures/ の変換不能 fixture を使って
 * scripts/html-fallback.js の判定・生成ロジックを直接検証する。
 *
 * 使い方:
 *   node scripts/test-html-fallback.js
 *
 * 検証内容:
 *   1. 正常な最小 .tex は isHtmlBodyMissing が false になる（誤検知しない）
 *   2. 変換不能 fixture（scripts/fixtures/broken-missing-file.tex）を
 *      latexmlc に通すと、本文が空の HTML になる
 *      （= build-html.js の判定基準3に該当）
 *   3. writeFallbackPage が PDF ありのとき、フォールバック HTML を生成し、
 *      diary-fallback マーカーと PDF embed を含む
 *   4. writeFallbackPage が PDF なしのとき ok:false を返す（生成しない）
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");
const { execFileSync } = require("child_process");

const { isHtmlBodyMissing, writeFallbackPage } = require("./html-fallback");

const REPO_ROOT = path.resolve(__dirname, "..");
const STYLES_DIR = path.join(REPO_ROOT, "styles");
const BINDINGS_DIR = path.join(REPO_ROOT, "scripts", "latexml-bindings");
const FIXTURES_DIR = path.join(REPO_ROOT, "scripts", "fixtures");

let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
  }
}

function checkLatexmlAvailable() {
  try {
    execFileSync("latexmlc", ["--help"], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (err) {
    return false;
  }
}

function buildWrapperTex(bodyPath) {
  return [
    "\\documentclass[paper=a4]{jlreq}",
    "\\usepackage[problem]{diary}",
    "\\begin{document}",
    `\\input{${bodyPath}}`,
    "\\end{document}",
    "",
  ].join("\n");
}

function runLatexml(bodyPath, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const wrapperPath = path.join(workDir, "wrapper.tex");
  fs.writeFileSync(wrapperPath, buildWrapperTex(bodyPath));
  const outPath = path.join(workDir, "out.html");

  let exitOk = true;
  try {
    execFileSync(
      "latexmlc",
      [
        `--path=${STYLES_DIR}`,
        `--path=${BINDINGS_DIR}`,
        "--format=html5",
        "--pmml",
        "--nodefaultresources",
        `--dest=${outPath}`,
        wrapperPath,
      ],
      { cwd: workDir, stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (err) {
    exitOk = false;
  }

  const outExists = fs.existsSync(outPath);
  const html = outExists ? fs.readFileSync(outPath, "utf8") : "";
  return { exitOk, outExists, html };
}

function main() {
  if (!checkLatexmlAvailable()) {
    console.error(
      "[fatal] latexmlc が見つかりません。devcontainer（latexml パッケージ導入済み）で実行してください。"
    );
    process.exitCode = 1;
    return;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "diary-fallback-test-"));

  // --- 1. 正常な最小 .tex は誤検知しない ---
  const okBodyPath = path.join(tmpRoot, "ok-body.tex");
  fs.writeFileSync(
    okBodyPath,
    "\\begin{diaryproblem}\nこれは正常な本文です。$1+1=2$\n\\end{diaryproblem}\n"
  );
  const okResult = runLatexml(okBodyPath, path.join(tmpRoot, "ok"));

  check("正常な .tex は latexmlc が exit 0 で終了する", () => {
    assert.strictEqual(okResult.exitOk, true);
  });
  check("正常な .tex の出力 HTML には本文がある（isHtmlBodyMissing=false）", () => {
    assert.strictEqual(isHtmlBodyMissing(okResult.html), false);
  });

  // --- 2. 変換不能 fixture は本文が空になる ---
  const fixturePath = path.join(FIXTURES_DIR, "broken-missing-file.tex");
  check("fixture ファイルが存在する", () => {
    assert.ok(fs.existsSync(fixturePath), fixturePath);
  });

  const brokenResult = runLatexml(fixturePath, path.join(tmpRoot, "broken"));
  check("fixture の出力 HTML は本文が空（isHtmlBodyMissing=true）", () => {
    assert.strictEqual(isHtmlBodyMissing(brokenResult.html), true);
  });

  // --- 3. writeFallbackPage: PDF ありのとき ---
  const idWithPdf = "9001";
  const distPdfDir = path.join(REPO_ROOT, "dist", "pdf", idWithPdf);
  fs.mkdirSync(distPdfDir, { recursive: true });
  fs.writeFileSync(path.join(distPdfDir, "problem.pdf"), "%PDF-1.4 fake pdf for test\n");

  const outDirWithPdf = path.join(tmpRoot, "dist-html", idWithPdf);
  const fallbackResult = writeFallbackPage(
    idWithPdf,
    "problem",
    outDirWithPdf,
    "html-body-empty"
  );

  check("PDF ありのとき writeFallbackPage は ok:true を返す", () => {
    assert.strictEqual(fallbackResult.ok, true);
  });
  check("フォールバック HTML ファイルが生成される", () => {
    assert.ok(fs.existsSync(path.join(outDirWithPdf, "problem.html")));
  });

  let fallbackHtml = "";
  check("フォールバック HTML に diary-fallback マーカーが含まれる", () => {
    fallbackHtml = fs.readFileSync(path.join(outDirWithPdf, "problem.html"), "utf8");
    assert.ok(fallbackHtml.includes('<meta name="diary-fallback" content="pdf" />'));
  });
  check("フォールバック HTML に PDF の embed が含まれる", () => {
    assert.ok(/<embed[^>]*type="application\/pdf"/.test(fallbackHtml));
  });
  check("フォールバック用に PDF が dist/html 配下へコピーされる", () => {
    assert.ok(fs.existsSync(path.join(outDirWithPdf, "problem.pdf")));
  });

  // --- 4. writeFallbackPage: PDF なしのとき ---
  const idWithoutPdf = "9002";
  const outDirWithoutPdf = path.join(tmpRoot, "dist-html", idWithoutPdf);
  const noPdfResult = writeFallbackPage(
    idWithoutPdf,
    "problem",
    outDirWithoutPdf,
    "html-body-empty"
  );
  check("PDF なしのとき writeFallbackPage は ok:false を返す", () => {
    assert.strictEqual(noPdfResult.ok, false);
  });
  check("PDF なしのときフォールバック HTML は生成されない", () => {
    assert.strictEqual(fs.existsSync(path.join(outDirWithoutPdf, "problem.html")), false);
  });

  // 後始末（テスト用に作った dist/pdf/9001, dist/html 一時ディレクトリ）
  fs.rmSync(path.join(REPO_ROOT, "dist", "pdf", idWithPdf), { recursive: true, force: true });
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log("");
  if (failed > 0) {
    console.error(`${failed} 件のテストが失敗しました。`);
    process.exitCode = 1;
  } else {
    console.log("すべてのテストが成功しました。");
  }
}

main();
