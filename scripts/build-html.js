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
 * （詳細は scripts/tikz-svg.js）。
 *
 * LaTeXML は任意の LaTeX を変換できるわけではない（docs/requirements.md）。
 * 変換失敗を検知した問題は、ビルド全体を止めずに PDF 埋め込みページへ
 * 自動フォールバックする（#24。判定基準・実装は scripts/html-fallback.js
 * および convertOne 内のコメント参照）。
 *
 * 差分ビルド（#230）:
 *   build-pdf.js と同様、問題ごとに problem.tex / solution.tex / meta.yaml /
 *   styles/diary.sty の内容から SHA-256 ハッシュを計算し、
 *   .cache/html-build-cache.json に前回成功時のハッシュを記録する。
 *   HTML 変換は latexmlc の起動・バインディング読み込みのオーバーヘッドが
 *   支配的なため（#230 の実測）、加えて scripts/latexml-bindings/ 配下と
 *   scripts/build-html.js 自身の内容もハッシュに含める。バインディングや
 *   変換ロジックが変われば全問の再変換を引き起こす（意図した挙動）。
 *   フォールバックが発動したケースは「変換の成功」ではないため、
 *   成功としてキャッシュしない（次回も再変換を試みる）。
 *
 * 使い方:
 *   node scripts/build-html.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, execFile } = require("child_process");
const {
  extractTikzPictures,
  buildSvgsForId,
  replacePlaceholdersInHtml,
} = require("./tikz-svg");
const { isHtmlBodyMissing, writeFallbackPage } = require("./html-fallback");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(REPO_ROOT, "content");
const STYLES_DIR = path.join(REPO_ROOT, "styles");
const BINDINGS_DIR = path.join(REPO_ROOT, "scripts", "latexml-bindings");
const DIST_HTML_DIR = path.join(REPO_ROOT, "dist", "html");
const WORK_DIR = path.join(DIST_HTML_DIR, ".work");
const CACHE_DIR = path.join(REPO_ROOT, ".cache");
const CACHE_PATH = path.join(CACHE_DIR, "html-build-cache.json");
const DIARY_STY_PATH = path.join(STYLES_DIR, "diary.sty");
const BUILD_HTML_JS_PATH = path.join(REPO_ROOT, "scripts", "build-html.js");

const MODES = ["problem", "solution"];

// latexmlc の --timeout（秒）。#55 の保険。
// jlreq.cls.ltxml 導入前は、バインディング欠落時に OmniBus → expl3-code.tex
// の生解釈へ流れ込み、latexmlc がハングして CI 全体を止めていた
// （デプロイ run 31141724783 で観測）。jlreq.cls.ltxml によって通常はこの
// 経路自体を通らなくなるが、将来別の未バインディング・パッケージで同様の
// ハングが再発した場合に備え、1 問題あたりの上限を明示しておく。
// 実測: ローカル（brew 版）で図なしの typical な問題1件の変換は数秒程度。
// TikZ 図の SVG 化は build-html.js 側で別途事前処理されるため、latexmlc
// 自体はテキスト＋数式のみを処理する。安全率を大きめに取り 120 秒とする
// （通常時の実測の数十倍。ハング検知が目的であり、日常運用では到達しない
// 想定の値）。
const LATEXMLC_TIMEOUT_SEC = 120;

// 同時実行数（#231）。latexmlc の起動オーバーヘッドが支配的で、各問題の
// 変換は独立したプロセス・作業ディレクトリで完結するため、問題（id）単位で
// 並列に実行する。id 内では problem → solution の順を維持する
// （図番号カウンタが id 単位で通番のため。下記 processId 参照）。
// デフォルトは CPU コア数と 8 の小さい方。環境変数 DIARY_HTML_JOBS で
// 上書き可能（CI のリソース制約や検証時の逐次比較用）。
function resolveJobs() {
  const envValue = process.env.DIARY_HTML_JOBS;
  if (envValue !== undefined && envValue !== "") {
    const n = Number(envValue);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    console.error(
      `[warn] DIARY_HTML_JOBS の値が不正です（${envValue}）。デフォルト値を使用します。`
    );
  }
  return Math.max(1, Math.min(8, os.cpus().length));
}
const JOBS = resolveJobs();

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

// dir 配下のファイルを再帰的に列挙し、REPO_ROOT からの相対パスでソートして返す。
// バインディングディレクトリの追加・削除・リネームもハッシュに反映させるため、
// ファイル名も内容と一緒にハッシュへ含める。
function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  };
  walk(dir);
  return results.sort();
}

// 問題によらず共通のハッシュ材料（diary.sty・latexml-bindings 一式・
// build-html.js 自身）を1本にまとめておき、全問題のハッシュ計算で使い回す。
// これらのいずれかが変われば全問の再変換を引き起こす。
function computeSharedContext() {
  const hash = crypto.createHash("sha256");

  hash.update("diary.sty:\n");
  hash.update(fs.existsSync(DIARY_STY_PATH) ? fs.readFileSync(DIARY_STY_PATH) : Buffer.from(""));
  hash.update("\n");

  hash.update("latexml-bindings:\n");
  for (const file of listFilesRecursive(BINDINGS_DIR)) {
    hash.update(`${path.relative(REPO_ROOT, file)}:\n`);
    hash.update(fs.readFileSync(file));
    hash.update("\n");
  }

  hash.update("build-html.js:\n");
  hash.update(
    fs.existsSync(BUILD_HTML_JS_PATH) ? fs.readFileSync(BUILD_HTML_JS_PATH) : Buffer.from("")
  );

  return hash.digest("hex");
}

// 問題 1 件分のハッシュ: problem.tex + solution.tex + meta.yaml + 共通コンテキスト
// （diary.sty・latexml-bindings・build-html.js 自身）の内容から SHA-256 を取る。
function computeHash(id, dir, sharedContextHash) {
  const hash = crypto.createHash("sha256");
  hash.update(`id:${id}\n`);
  for (const name of ["problem.tex", "solution.tex", "meta.yaml"]) {
    const p = path.join(dir, name);
    const content = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.from("");
    hash.update(`${name}:\n`);
    hash.update(content);
    hash.update("\n");
  }
  hash.update("shared:\n");
  hash.update(sharedContextHash);
  return hash.digest("hex");
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

// execFileSync 版の latexmlc 呼び出しを Promise でラップしたもの。
// 並列実行時にイベントループをブロックしないよう execFile（非同期）を使う。
function runLatexmlc(args, options) {
  return new Promise((resolve) => {
    execFile("latexmlc", args, options, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr });
    });
  });
}

// id 単位で problem → solution の順に図番号を通番で振るためのカウンタ。
// 呼び出し側（main）が id ごとに { next: 1 } を渡す。
async function convertOne(id, mode, bodyPath, failures, generated, figCounter, fallbacks) {
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

  // --- 失敗判定基準（#24） ---
  // 以下のいずれかを満たしたら「変換失敗」とみなし、PDF 埋め込みの
  // フォールバックページへ切り替える（scripts/html-fallback.js）。
  //   1. latexmlc の exit code が非 0（execFileSync が例外を投げる）
  //   2. exit 0 でも --dest で指定した出力 HTML ファイルが存在しない（欠損）
  //   3. 出力 HTML は存在するが空、または <body> 内に実質コンテンツがない
  //      （タグを剥がした後のテキストが空。isHtmlBodyMissing 参照）
  let failureReason = null;

  const { err, stderr: latexmlcStderr } = await runLatexmlc(
    [
      `--path=${STYLES_DIR}`,
      `--path=${BINDINGS_DIR}`,
      "--format=html5",
      "--pmml", // MathML (Presentation) を出力に含める
      // #150: alttext が生 LaTeX のまま露出し、semantics/annotation も
      // 無かった問題への対応。--mathtex により各 <math> を
      // <semantics>...<annotation encoding="application/x-tex">元のTeX</annotation></semantics>
      // でラップする（LaTeXML 標準機能。見た目の Presentation MathML 部分は
      // 変更されないため、数式表示への影響はない）。
      "--mathtex",
      "--nodefaultresources",
      `--timeout=${LATEXMLC_TIMEOUT_SEC}`,
      `--dest=${outPath}`,
      wrapperPath,
    ],
    {
      cwd: workDir,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  if (err) {
    // 判定基準1: latexmlc が非 0 で終了した（=致命的エラー）。
    failureReason = "latexmlc-nonzero-exit";
    console.error(`[fail] ${id} ${mode}: latexmlc 変換失敗（exit 非 0）`);
    const log = latexmlcStderr ? latexmlcStderr.toString() : "";
    if (log) {
      console.error(log.split("\n").slice(-40).join("\n"));
    }
  }

  if (!failureReason && !fs.existsSync(outPath)) {
    // 判定基準2: exit 0 でも出力 HTML が生成されなかった。
    failureReason = "html-output-missing";
    console.error(`[fail] ${id} ${mode}: HTML が生成されませんでした`);
  }

  let html = null;
  if (!failureReason) {
    html = fs.readFileSync(outPath, "utf8");
    if (isHtmlBodyMissing(html)) {
      // 判定基準3: 出力 HTML はあるが本文が空。
      failureReason = "html-body-empty";
      console.error(`[fail] ${id} ${mode}: 出力 HTML の本文が空です`);
    }
  }

  if (failureReason) {
    const result = writeFallbackPage(id, mode, outDir, failureReason);
    if (result.ok) {
      generated.push(result.path);
      // フォールバックも「ビルドは止めない」設計の一部として成功扱いだが、
      // 通常変換との区別のため failures には積まず、別カウンタで記録する。
      fallbacks.push({ id, mode, reason: failureReason });
      return true;
    }
    // PDF も無くフォールバックすら出せない場合のみ、真の失敗として扱う。
    failures.push({ id, mode });
    return false;
  }

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

// id 1 件分の変換処理（problem → solution を直列で実行し、図番号の通番を守る）。
// 呼び出し元（main）が id ごとに並列実行する。失敗/フォールバック/生成物は
// 呼び出し元で共有される配列に直接 push するが、Node.js はシングルスレッド
// でこれらの await の間にしか他の処理が挟まらないため（真の同時書き込みは
// 発生しない）、配列操作自体の競合は起きない。並列化による時間短縮は
// 外部プロセス（latexmlc）の起動・実行がイベントループをブロックせずに
// 複数同時に進行することで得られる。
async function processId(id, dir, hash, failures, generated, fallbacks) {
  const idFailuresBefore = failures.length;
  const idFallbacksBefore = fallbacks.length;

  const figCounter = { next: 1 };
  for (const mode of MODES) {
    const bodyPath = path.join(dir, `${mode}.tex`);
    if (!fs.existsSync(bodyPath)) {
      failures.push({ id, mode });
      console.error(`[fail] ${id} ${mode}: ${mode}.tex が見つかりません`);
      continue;
    }
    await convertOne(id, mode, bodyPath, failures, generated, figCounter, fallbacks);
  }

  // フォールバックが発動した問題や真の失敗が出た問題は「変換の成功」とは
  // 見なさない。壊れた/暫定的な出力を成功としてキャッシュしてしまうと、
  // 原因を修正した後も再変換されず永久にそのまま扱われてしまうため。
  const hadFailure = failures.length > idFailuresBefore;
  const hadFallback = fallbacks.length > idFallbacksBefore;
  const idSuccess = !hadFailure && !hadFallback;
  return { hash, success: idSuccess };
}

// 単純な固定サイズのワーカープール。tasks は () => Promise<void> の配列。
// 同時実行数は JOBS（DIARY_HTML_JOBS または CPU コア数から算出）。
async function runPool(tasks, concurrency) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor;
      cursor += 1;
      await tasks[i]();
    }
  });
  await Promise.all(workers);
}

async function main() {
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
  const fallbacks = [];
  const skipped = [];

  const cache = loadCache();
  const sharedContextHash = computeSharedContext();
  const nextCache = {};

  console.log(`[jobs] 同時実行数: ${JOBS}`);

  const targets = [];
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

    const hash = computeHash(id, dir, sharedContextHash);
    const prev = cache[id];

    let useCache = false;
    if (prev && prev.hash === hash && prev.success === true) {
      const outDir = path.join(DIST_HTML_DIR, id);
      const problemHtml = path.join(outDir, "problem.html");
      const solutionHtml = path.join(outDir, "solution.html");
      if (fs.existsSync(problemHtml) && fs.existsSync(solutionHtml)) {
        console.log(`[skip] ${id}: 変更なし・スキップ`);
        skipped.push(id);
        nextCache[id] = prev;
        useCache = true;
      } else {
        console.log(`[cache] ${id}: HTML 出力が見つからないため再変換します`);
      }
    } else if (prev && prev.hash === hash && prev.success === false) {
      console.log(`[cache] ${id}: ハッシュ一致だが前回変換失敗のため再変換します`);
    } else if (prev) {
      console.log(`[cache] ${id}: 変更を検出・再変換します`);
    } else {
      console.log(`[cache] ${id}: 初回変換します`);
    }

    if (useCache) continue;

    targets.push({ id, dir, hash });
  }

  // id 単位を並列化の単位とする（id 内では problem → solution の直列を維持）。
  const tasks = targets.map(({ id, dir, hash }) => async () => {
    const result = await processId(id, dir, hash, failures, generated, fallbacks);
    nextCache[id] = result;
  });
  await runPool(tasks, JOBS);

  saveCache(nextCache);

  console.log(`スキップされた問題: ${skipped.length} 件`);
  console.log("");
  console.log(`生成された HTML: ${generated.length} 件`);
  for (const p of generated) {
    console.log(`  ${path.relative(REPO_ROOT, p)}`);
  }

  if (fallbacks.length > 0) {
    console.log("");
    console.log(`[fallback] PDF 埋め込みフォールバックが発動した問題: ${fallbacks.length} 件`);
    for (const f of fallbacks) {
      console.log(`  ${f.id} (${f.mode}): ${f.reason}`);
    }
  }

  // #55 追加要件: 1000 問規模になっても目視に頼らず正常系の劣化に
  // 気づけるよう、成功件数とフォールバック件数（該当 ID 一覧つき）を
  // 常に stdout に出力する。convertOne が成功として扱う変換（=通常の
  // HTML 生成）は generated から fallbacks 分を差し引いて数える
  // （generated にはフォールバックページのパスも積まれているため）。
  const successCount = generated.length - fallbacks.length;
  const fallbackIdList = [...new Set(fallbacks.map((f) => f.id))].sort();
  const summaryLine = `HTML 変換: 成功 ${successCount} 件 / フォールバック ${fallbacks.length} 件${
    fallbackIdList.length > 0 ? ` (${fallbackIdList.join(", ")})` : ""
  }`;
  console.log("");
  console.log(summaryLine);

  // CI（GitHub Actions）のジョブサマリにも同じ内容を追記する。
  // ワークフローファイル自体は変更禁止のため、スクリプト側で
  // GITHUB_STEP_SUMMARY（Actions が自動的に用意する環境変数。
  // ローカル実行では未設定）が存在する場合にのみ書き込む。
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    try {
      const lines = [
        "",
        "## HTML 変換サマリ（#55）",
        "",
        `- 成功: ${successCount} 件`,
        `- フォールバック: ${fallbacks.length} 件`,
      ];
      if (fallbackIdList.length > 0) {
        lines.push(`  - 該当 ID: ${fallbackIdList.join(", ")}`);
        lines.push("");
        lines.push("| ID | mode | reason |");
        lines.push("| --- | --- | --- |");
        for (const f of fallbacks) {
          lines.push(`| ${f.id} | ${f.mode} | ${f.reason} |`);
        }
      }
      lines.push("");
      fs.appendFileSync(stepSummaryPath, lines.join("\n") + "\n");
    } catch (err) {
      // サマリ書き込みの失敗はビルド自体を止める理由にはしない。
      console.error(
        `[warn] GITHUB_STEP_SUMMARY への書き込みに失敗しました: ${err.message}`
      );
    }
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

main().catch((err) => {
  console.error(`[fatal] 予期しないエラーで終了しました: ${err.stack || err.message}`);
  process.exitCode = 1;
});
