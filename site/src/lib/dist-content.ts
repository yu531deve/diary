// dist/（リポジトリルート直下、site/ の一つ上）から、
// make pdf && make html が生成した成果物を読み取るための共通ヘルパー。
//
// site/ のビルドは「dist/pdf・dist/html が事前に存在する」前提で動く
// （#26 の要求。依存関係の明文化は #27 の make build で行う）。
// dist が無い場合はここで分かりやすいエラーを投げる。

import fs from "node:fs";
import path from "node:path";

// import.meta.url は Vite のバンドル処理で書き換えられ、ビルド時の実際の
// ファイル配置と一致しないことがあるため使わない。
// site/src/pages/index.astro と同様、astro のコマンドは常に site/ を
// カレントディレクトリとして実行される前提で process.cwd() から辿る。
export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const CONTENT_DIR = path.join(REPO_ROOT, "content");
export const DIST_HTML_DIR = path.join(REPO_ROOT, "dist", "html");
export const DIST_PDF_DIR = path.join(REPO_ROOT, "dist", "pdf");

export type FieldMeta = {
  major: string;
  minor: string;
};

export type ProblemMeta = {
  id: string;
  title: string;
  status: string;
  field: FieldMeta;
  tags: string[];
  difficulty: string;
};

/**
 * meta.yaml の最小限のフィールドだけを正規表現で取り出す。
 * YAML パーサへの依存を増やしたくないための簡易実装
 * （site/src/pages/index.astro の parseMetaYaml と同方針）。
 */
export function parseMetaYaml(text: string): ProblemMeta {
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s*"?([^"\n]+)"?\\s*$`, "m"));
    return m ? m[1].trim() : "";
  };
  const major = text.match(/^\s*major:\s*"?([^"\n]+)"?\s*$/m);
  const minor = text.match(/^\s*minor:\s*"?([^"\n]+)"?\s*$/m);
  const tagsLine = text.match(/^tags:\s*\[([^\]]*)\]\s*$/m);
  const tags = tagsLine
    ? tagsLine[1]
        .split(",")
        .map((t) => t.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
    : [];
  return {
    id: get("id"),
    title: get("title"),
    status: get("status"),
    field: {
      major: major ? major[1].trim() : "",
      minor: minor ? minor[1].trim() : "",
    },
    tags,
    difficulty: get("difficulty"),
  };
}

/**
 * content/ 配下の status: published な問題の meta.yaml を id 順に列挙する。
 * 問題 ID は連番・不変（CLAUDE.md の不変条件）。並び順は id の文字列昇順。
 */
export function listPublishedProblems(): ProblemMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const entries = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  return entries
    .map((id) => {
      const metaPath = path.join(CONTENT_DIR, id, "meta.yaml");
      if (!fs.existsSync(metaPath)) return null;
      return parseMetaYaml(fs.readFileSync(metaPath, "utf-8"));
    })
    .filter(
      (m): m is ProblemMeta => m !== null && m.status === "published"
    );
}

export class DistNotFoundError extends Error {}

function assertDistExists() {
  if (!fs.existsSync(DIST_HTML_DIR) || !fs.existsSync(DIST_PDF_DIR)) {
    throw new DistNotFoundError(
      "dist/html または dist/pdf が見つかりません。\n" +
        "site のビルドは `make pdf && make html` の生成物に依存しています。\n" +
        "リポジトリルートで `make pdf && make html` を実行してから、\n" +
        "再度 `npm run build`（site/）を実行してください。"
    );
  }
}

export type ProblemHtml = {
  /** true の場合、HTML 変換に失敗し PDF 埋め込みフォールバックになっている */
  isFallback: boolean;
  /** 本文の HTML 断片（<article>...）。フォールバック時は空文字列 */
  bodyHtml: string;
  /** フォールバック理由（フォールバック時のみ） */
  fallbackReason: string;
  /** 同ディレクトリに存在する fig-*.svg のファイル名一覧 */
  figureFiles: string[];
};

/**
 * dist/html/{id}/problem.html を読み、本文の HTML 断片を取り出す。
 * <meta name="diary-fallback"> があれば PDF 埋め込みフォールバックとして扱う
 * （scripts/html-fallback.js が焼き込むマーカー）。
 */
export function readProblemHtml(id: string): ProblemHtml {
  assertDistExists();
  const htmlPath = path.join(DIST_HTML_DIR, id, "problem.html");
  if (!fs.existsSync(htmlPath)) {
    throw new DistNotFoundError(
      `dist/html/${id}/problem.html が見つかりません。` +
        "`make html` を実行して生成してください。"
    );
  }
  const html = fs.readFileSync(htmlPath, "utf-8");

  const dir = path.join(DIST_HTML_DIR, id);
  const figureFiles = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /^fig-.*\.svg$/i.test(f))
        .sort()
    : [];

  const isFallback = /<meta\s+name="diary-fallback"/i.test(html);
  if (isFallback) {
    const reasonMatch = html.match(
      /<meta\s+name="diary-fallback-reason"\s+content="([^"]*)"/i
    );
    return {
      isFallback: true,
      bodyHtml: "",
      fallbackReason: reasonMatch ? reasonMatch[1] : "",
      figureFiles,
    };
  }

  // LaTeXML 出力から <article class="ltx_document">...</article> だけを
  // 取り出す。ページ全体のラッパー（ltx_page_main 等）やフッター
  // （LaTeXML のロゴ・生成日時）はサイト側で独自のレイアウトを持つため不要。
  const articleMatch = html.match(
    /<article[^>]*class="[^"]*ltx_document[^"]*"[^>]*>[\s\S]*?<\/article>/i
  );
  const bodyHtml = articleMatch ? articleMatch[0] : "";

  return {
    isFallback: false,
    bodyHtml,
    fallbackReason: "",
    figureFiles,
  };
}

/** dist/pdf/{id}/problem.pdf が存在するかどうか */
export function hasProblemPdf(id: string): boolean {
  assertDistExists();
  return fs.existsSync(path.join(DIST_PDF_DIR, id, "problem.pdf"));
}
