"use strict";

/**
 * LaTeXML 変換失敗時の PDF 埋め込みフォールバック（#24）。
 *
 * 失敗判定基準（build-html.js の convertOne から呼ばれる。
 * ここでは「判定された失敗」を受け取ってフォールバックページを作るだけで、
 * 判定そのものは build-html.js 側にある。理由: 判定は latexmlc の
 * exit code・出力ファイルの有無など「変換の実行過程」に依存する情報が
 * 必要で、build-html.js が既にその文脈を持っているため。判定基準は
 * 以下の3つのいずれか（build-html.js 内のコメント参照）:
 *   1. latexmlc が非 0 の exit code で終了した（execFileSync が例外を投げる）
 *   2. latexmlc が exit 0 でも出力 HTML ファイルが生成されなかった（欠損）
 *   3. 出力 HTML は存在するが、空、または本文（<body> 内の実質コンテンツ）
 *      が存在しない（LaTeXML が空の骨格 HTML だけ吐いて終わる異常系）
 *
 * フォールバック発動時にやること:
 *   - dist/pdf/{id}/{mode}.pdf が存在すれば、それを埋め込む HTML を
 *     dist/html/{id}/{mode}.html として生成する
 *   - PDF が無い場合はフォールバックすら出せないため、明確なログを出して
 *     失敗として扱う（build-html.js 側の failures に積む）
 *   - 生成した HTML には <meta name="diary-fallback" content="pdf"> を
 *     埋め込み、フォールバックであることを機械的に判別可能にする
 *   - ビルドログにも [fallback] プレフィックスで判別可能な行を出す
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIST_PDF_DIR = path.join(REPO_ROOT, "dist", "pdf");

/**
 * latexmlc の出力 HTML が「本文が存在しない」欠損状態かどうかを判定する。
 * 空ファイル、または <body> タグの中身が空白のみ／存在しない場合に true。
 *
 * @param {string} html
 * @returns {boolean} true なら欠損（本文なし）
 */
function isHtmlBodyMissing(html) {
  if (!html || html.trim().length === 0) return true;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return true;
  const bodyRaw = bodyMatch[1];

  // 先にタグを剥がしてテキストだけにする。LaTeXML のフッターロゴ
  // （"Generated ... by LaTeXML"）は "LaTeXML" の各文字が
  // <span>...</span> で装飾されており、タグ付きのままでは
  // "by\s+LaTeXML" のような文字列一致では拾えないため。
  const strippedText = bodyRaw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "");

  // LaTeXML はエラーで本文が丸ごと欠落しても、末尾に
  // "Generated ... by LaTeXML" というフッターだけは出力してしまう
  // （scripts/fixtures/broken-missing-file.tex で確認済み）。
  // これだけが残っている状態は「本文なし」として扱うため、
  // 判定前にこのフッター文言を取り除く。
  const bodyInner = strippedText
    .replace(/Generated\s+.*?by\s+LaTeXML\.?/gi, "")
    .trim();
  return bodyInner.length === 0;
}

function pdfPathFor(id, mode) {
  return path.join(DIST_PDF_DIR, id, `${mode}.pdf`);
}

/**
 * フォールバック HTML の本文を組み立てる。
 * PDF を <embed>/<iframe> で埋め込み、ダウンロードリンクも併記する。
 * <meta name="diary-fallback" content="pdf"> がフォールバック判別マーカー。
 */
function buildFallbackHtml(id, mode, pdfRelHref, reason) {
  const modeLabel = mode === "problem" ? "問題" : "解答";
  const escapedReason = String(reason || "").replace(/[<>&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])
  );
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="diary-fallback" content="pdf" />
<meta name="diary-fallback-reason" content="${escapedReason}" />
<title>${id} ${modeLabel}（PDF 表示）</title>
<style>
  body { margin: 0; font-family: sans-serif; }
  .diary-fallback-notice { padding: 0.75em 1em; background: #fff3cd; border-bottom: 1px solid #ffe08a; font-size: 0.9em; }
  .diary-fallback-embed { width: 100%; height: 90vh; border: none; }
  .diary-fallback-download { padding: 0.5em 1em; }
</style>
</head>
<body>
  <p class="diary-fallback-notice">
    この問題（ID: ${id} / ${modeLabel}）は HTML への自動変換に失敗したため、PDF を埋め込み表示しています。
  </p>
  <p class="diary-fallback-download">
    <a href="${pdfRelHref}">PDF をダウンロード</a>
  </p>
  <embed class="diary-fallback-embed" src="${pdfRelHref}" type="application/pdf" />
</body>
</html>
`;
}

/**
 * フォールバックページを生成する。
 *
 * @param {string} id 問題 ID
 * @param {string} mode "problem" | "solution"
 * @param {string} outDir dist/html/{id}
 * @param {string} reason 失敗理由（ログ・meta タグ用の短い文字列）
 * @returns {{ ok: boolean, path?: string, error?: string }}
 *   ok: false は「PDF も無くフォールバックすら出せなかった」場合
 */
function writeFallbackPage(id, mode, outDir, reason) {
  const pdfPath = pdfPathFor(id, mode);

  if (!fs.existsSync(pdfPath)) {
    console.error(
      `[fallback] ${id} ${mode}: 変換失敗（${reason}）だが PDF (${path.relative(REPO_ROOT, pdfPath)}) も存在しないため、` +
        `フォールバックページを生成できません。先に \`make pdf\` を実行してください。`
    );
    return { ok: false, error: "pdf-missing" };
  }

  fs.mkdirSync(outDir, { recursive: true });

  // dist/html/{id}/{mode}.pdf として PDF をコピーし、フォールバックページから
  // 相対パスで参照できるようにする（PDF ダウンロードは同一 dist/html 配下で完結させる）。
  const pdfDestPath = path.join(outDir, `${mode}.pdf`);
  fs.copyFileSync(pdfPath, pdfDestPath);

  const html = buildFallbackHtml(id, mode, `${mode}.pdf`, reason);
  const htmlPath = path.join(outDir, `${mode}.html`);
  fs.writeFileSync(htmlPath, html);

  console.log(
    `[fallback] ${id} ${mode}: HTML 変換失敗（${reason}）のため PDF 埋め込みページへフォールバックしました -> ${path.relative(REPO_ROOT, htmlPath)}`
  );

  return { ok: true, path: htmlPath };
}

module.exports = {
  isHtmlBodyMissing,
  writeFallbackPage,
  buildFallbackHtml,
  pdfPathFor,
};
