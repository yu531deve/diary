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
  /** meta.yaml の updated（YYYY-MM-DD の文字列）。無ければ空文字 */
  updated: string;
  /** meta.yaml の created（YYYY-MM-DD の文字列）。無ければ空文字 */
  created: string;
};

/**
 * meta.yaml の最小限のフィールドだけを正規表現で取り出す。
 * YAML パーサへの依存を増やしたくないための簡易実装
 * （site/src/pages/index.astro の parseMetaYaml と同方針）。
 */
/**
 * YAML のスカラー値からクォートを剥がす。
 * `"..."` `'...'` どちらの引用符でも、前後が同じ種類の引用符で
 * 対になっている場合のみ剥がす（#227: バックスラッシュを含む title は
 * 単一引用符で書かれる。従来は `"?` のみを見ていたため、単一引用符の
 * 値では引用符自体が本文に残ってしまっていた）。
 */
function stripYamlQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return v.slice(1, -1);
    }
  }
  return v;
}

export function parseMetaYaml(text: string): ProblemMeta {
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
    return m ? stripYamlQuotes(m[1]) : "";
  };
  const major = text.match(/^\s*major:\s*(.+?)\s*$/m);
  const minor = text.match(/^\s*minor:\s*(.+?)\s*$/m);
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
      major: major ? stripYamlQuotes(major[1]) : "",
      minor: minor ? stripYamlQuotes(minor[1]) : "",
    },
    tags,
    difficulty: get("difficulty"),
    updated: get("updated"),
    created: get("created"),
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

/**
 * dist/html/{id}/solution.html を読み、本文の HTML 断片を取り出す。
 * readProblemHtml と同じ規約（フォールバックマーカー・article 抽出）。
 */
export function readSolutionHtml(id: string): ProblemHtml {
  assertDistExists();
  const htmlPath = path.join(DIST_HTML_DIR, id, "solution.html");
  if (!fs.existsSync(htmlPath)) {
    throw new DistNotFoundError(
      `dist/html/${id}/solution.html が見つかりません。` +
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

/** dist/pdf/{id}/solution.pdf が存在するかどうか */
export function hasSolutionPdf(id: string): boolean {
  assertDistExists();
  return fs.existsSync(path.join(DIST_PDF_DIR, id, "solution.pdf"));
}

/**
 * dist/html/{id}/{hint,policy}.html を読む、解答ページの STEP1/STEP2
 * 用の任意ファイル（#67）。
 *
 * content/{id}/ には現時点で hint.tex・policy.tex の原稿規約が存在せず
 * （content/CLAUDE.md 参照）、scripts/build-html.js も problem/solution
 * の 2 種類しかビルドしない。つまり今は常に存在しない。
 * そのため readProblemHtml/readSolutionHtml と異なり「無ければ例外」では
 * なく null を返す ―― 将来 hint.tex・policy.tex の原稿規約が追加された
 * 際に、このページ側の変更なしで自動的に STEP1/STEP2 が出せるようにする
 * ための最小限のフック。原稿が無い問題（現状すべて）は該当 STEP を
 * 出さない、という #67 の要件はこの null 分岐で自然に満たされる。
 */
function readOptionalStepHtml(id: string, mode: "hint" | "policy"): ProblemHtml | null {
  if (!fs.existsSync(DIST_HTML_DIR)) return null;
  const htmlPath = path.join(DIST_HTML_DIR, id, `${mode}.html`);
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, "utf-8");

  const isFallback = /<meta\s+name="diary-fallback"/i.test(html);
  if (isFallback) return null; // STEP1/2 はフォールバック表示に対応しない

  const articleMatch = html.match(
    /<article[^>]*class="[^"]*ltx_document[^"]*"[^>]*>[\s\S]*?<\/article>/i
  );
  const bodyHtml = articleMatch ? articleMatch[0] : "";
  if (!bodyHtml) return null;

  return { isFallback: false, bodyHtml, fallbackReason: "", figureFiles: [] };
}

/** dist/html/{id}/hint.html があれば読む。無ければ null（STEP1 を出さない） */
export function readHintHtml(id: string): ProblemHtml | null {
  return readOptionalStepHtml(id, "hint");
}

/** dist/html/{id}/policy.html があれば読む。無ければ null（STEP2 を出さない） */
export function readPolicyHtml(id: string): ProblemHtml | null {
  return readOptionalStepHtml(id, "policy");
}

/**
 * 解答本文 HTML（LaTeXML 出力）のうち、各 `<li class="ltx_item">`
 * （enumerate の各設問）ごとに「最後の表示数式」を「答え」とみなし、
 * `diary-final-equation` クラスを付与する。設問区切りが無い解答では
 * 文書全体の最後の表示数式を対象にする。
 *
 * 原稿側に「これが答え」という印を付ける記法が無いため（content/CLAUDE.md
 * に規定なし）、design/README.md の意図（各設問の最終結果を
 * `border-left: 2px solid #52e0f5` で強調する）をヒューリスティックで
 * 近似する。原稿の書き方に依存する近似であることは PR に明記する。
 */
export function markFinalAnswerEquations(html: string): string {
  if (!html) return html;
  const liRe = /<li\b[^>]*class="[^"]*ltx_item[^"]*"[^>]*>/g;
  const liStarts: number[] = [];
  let liMatch: RegExpExecArray | null;
  while ((liMatch = liRe.exec(html))) liStarts.push(liMatch.index);

  const chunks: string[] =
    liStarts.length === 0
      ? [html]
      : [html.slice(0, liStarts[0]), ...liStarts.map((start, i) => html.slice(start, liStarts[i + 1] ?? html.length))];

  const tableOpenRe = /<table\s+id="[^"]*"\s+class="ltx_equation ltx_eqn_table">/g;
  const marked = chunks.map((chunk) => {
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    tableOpenRe.lastIndex = 0;
    while ((m = tableOpenRe.exec(chunk))) last = m;
    if (!last) return chunk;
    const openTag = last[0];
    const replaced = openTag.replace(
      'class="ltx_equation ltx_eqn_table"',
      'class="ltx_equation ltx_eqn_table diary-final-equation"'
    );
    return chunk.slice(0, last.index) + replaced + chunk.slice(last.index + openTag.length);
  });

  return marked.join("");
}

// 旧 extractFinalAnswerMath（文書全体の最後の表示数式を右カラムの ANSWER
// カードに再レンダリングする関数）は #67 のレビューで削除した。
// MathML 断片を機械的に抜き出して独立に再レンダリングする方式は、
// 抜き出した断片が本文の該当式と意味的に完全一致することを保証できず、
// 実機検証で誤った見え方をする既知のリスクがあったため。
// 現在は ANSWER カードから本文の答えブロックへのアンカーリンクに
// 置き換えている（site/src/pages/solutions/[id]/index.astro 参照）。
