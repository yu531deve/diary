// ビルド時データ生成ユーティリティ（#61）。
//
// content/ と fields.yaml から (a) サイト統計（公開問題数・分野数・
// 分野別問題数・新着一覧）、(b) 検索用軽量インデックス（id/title/field/sub/tags
// のみ）を算出する。どちらも status: published のみを対象とし、
// draft（listPublishedProblems の時点で除外済み）は含めない。
//
// 数値のハードコード禁止（design/README.md 実装時の注意 6）。
// トップページの `0042 PROBLEMS` `18 FIELDS` 等はすべてここ経由の実データに
// 置き換えること。

import fs from "node:fs";
import path from "node:path";
import { CONTENT_DIR, REPO_ROOT, listPublishedProblems } from "./dist-content";
import type { ProblemMeta } from "./dist-content";
import { formatMathTitle } from "./title";

export const FIELDS_YAML_PATH = path.join(REPO_ROOT, "fields.yaml");

/**
 * fields.yaml の1大分野。#92 で `{major: [minors]}` のマップ構造から
 * `slug` 付きリスト構造に刷新した（URL を日本語の大分野名に直接
 * 依存させないため。site/src/pages/problems/[id]/index.astro 参照）。
 */
export type FieldTreeEntry = {
  slug: string;
  major: string;
  minors: string[];
};

/**
 * fields.yaml をパースし、大分野→中分野の順序付き構造を返す。
 * YAML パーサへの依存を増やさない方針は dist-content.ts の parseMetaYaml
 * と同じ簡易実装。想定する構造は以下（トップレベルはリスト）:
 *
 *   - slug: calculus
 *     name: 微分積分学
 *     minors:
 *       - 一変数の微分積分
 *       - ...
 */
export function parseFieldsTree(): FieldTreeEntry[] {
  if (!fs.existsSync(FIELDS_YAML_PATH)) return [];
  const text = fs.readFileSync(FIELDS_YAML_PATH, "utf-8");
  const tree: FieldTreeEntry[] = [];
  let current: FieldTreeEntry | null = null;
  let inMinors = false;
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    // 新しい大分野の開始: "- slug: xxx"
    const slugStart = line.match(/^-\s*slug:\s*(\S+)\s*$/);
    if (slugStart) {
      current = { slug: slugStart[1].trim(), major: "", minors: [] };
      tree.push(current);
      inMinors = false;
      continue;
    }
    if (!current) continue;

    const nameMatch = line.match(/^\s+name:\s*(.+?)\s*$/);
    if (nameMatch) {
      current.major = nameMatch[1].trim().replace(/^["']|["']$/g, "");
      inMinors = false;
      continue;
    }

    if (/^\s+minors:\s*$/.test(line)) {
      inMinors = true;
      continue;
    }

    const minorMatch = line.match(/^\s+-\s*(.+?)\s*$/);
    if (minorMatch && inMinors) {
      current.minors.push(minorMatch[1].trim().replace(/^["']|["']$/g, ""));
    }
  }
  return tree;
}

/**
 * fields.yaml をパースし、大分野名の配列を返す（記載順）。
 */
export function listFieldMajors(): string[] {
  return parseFieldsTree().map((entry) => entry.major);
}

/**
 * 大分野名（field.major の値）から fields.yaml の slug を引く。
 * `/fields/{slug}/` の URL 生成に使う（#92）。見つからない場合は
 * undefined（呼び出し側でフォールバックすること）。
 */
export function fieldSlugByMajor(major: string): string | undefined {
  return parseFieldsTree().find((entry) => entry.major === major)?.slug;
}

export type FieldCount = {
  major: string;
  count: number;
};

export type SiteStats = {
  /** status: published な問題の総数 */
  problemCount: number;
  /** fields.yaml に定義された大分野の総数（実際に問題があるかは問わない） */
  fieldCount: number;
  /** 大分野ごとの published 問題数。fields.yaml の記載順、0 件の分野も含む */
  byField: FieldCount[];
  /** updated 降順（同値は id 降順）で並べた新着一覧 */
  recent: ProblemMeta[];
};

/**
 * content/ と fields.yaml から published 問題数・分野数・分野別問題数・
 * 新着一覧を算出する。
 */
export function computeSiteStats(limit = 10): SiteStats {
  const problems = listPublishedProblems();
  const majors = listFieldMajors();

  const countByMajor = new Map<string, number>();
  for (const major of majors) countByMajor.set(major, 0);
  for (const p of problems) {
    if (!p.field.major) continue;
    countByMajor.set(p.field.major, (countByMajor.get(p.field.major) ?? 0) + 1);
  }
  const byField: FieldCount[] = majors.map((major) => ({
    major,
    count: countByMajor.get(major) ?? 0,
  }));

  const recent = [...problems]
    .sort((a, b) => {
      if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    })
    .slice(0, limit);

  return {
    problemCount: problems.length,
    fieldCount: majors.length,
    byField,
    recent,
  };
}

export type SearchIndexEntry = {
  id: string;
  title: string;
  field: string;
  sub: string;
  tags: string[];
  /** design/README.md D（⌘K 検索）の結果行に表示する難易度（"1"〜"5"）。#70 で追加。 */
  difficulty: string;
};

/**
 * 検索用の軽量インデックスを生成する。
 * 数式・地の文は含めない（数式検索は仕様外。CLAUDE.md 禁止事項）。
 * id/title/field/sub/tags に加え、⌘K 検索モーダル（#70）の結果行に
 * 難易度ドット（★☆）を出すため difficulty のみ追加している
 * （地の文・数式は含めないという方針は維持）。
 */
export function buildSearchIndex(): SearchIndexEntry[] {
  return listPublishedProblems().map((p) => ({
    id: p.id,
    // #227: title は LaTeX（\diarytitle 用）が正のため、検索インデックス
    // には formatMathTitle で $ や LaTeX コマンドを除いた平文を積む
    // （そうしないと Pagefind の索引・結果表示に $...$ がそのまま出る）。
    title: formatMathTitle(p.title),
    field: p.field.major,
    sub: p.field.minor,
    tags: p.tags,
    difficulty: p.difficulty,
  }));
}

export type FieldIndexMinor = {
  name: string;
  count: number;
};

export type FieldIndexMajor = {
  no: string;
  slug: string;
  major: string;
  count: number;
  minors: FieldIndexMinor[];
};

/**
 * `${major}` と `${minor}` を連結した複合キーを作る。区切り文字には
 * 素の半角スペースではなく、バックスラッシュでエスケープしたスペース
 * (`\\ `) を使い、major/minor の値そのものに空白が含まれる場合でも
 * 区切り位置が曖昧にならないようにする。
 *
 * #116: 以前はここに実体のリテラル NUL バイト（\\x00）を区切りとして
 * 埋め込んでいたため、このファイルが git に「バイナリファイル」と
 * 誤判定され差分が表示できなくなっていた（byte offset 5861 / 6075 /
 * 6418 付近）。挙動は変えずに ASCII 安全な `'\\ '` エスケープ表記へ
 * 置き換えて解消した（#92 の本筋ではないが、同じ関数を触るため
 * 分離すると衝突するので併せて対応した）。
 */
function fieldIndexKey(major: string, minor: string): string {
  return `${major}\\ ${minor}`;
}

/**
 * /fields/ アコーディオン索引用のデータ。大分野ごとに中分野と
 * published 問題数を積んだもの。fields.yaml の記載順を維持し、
 * 問題 0 件の大分野・中分野も含める（表示上のグレーアウトは
 * ページ側の責務）。
 */
export function computeFieldIndex(): FieldIndexMajor[] {
  const problems = listPublishedProblems();
  const tree = parseFieldsTree();

  const majorCounts = new Map<string, number>();
  const minorCounts = new Map<string, number>();
  for (const p of problems) {
    if (!p.field.major) continue;
    majorCounts.set(p.field.major, (majorCounts.get(p.field.major) ?? 0) + 1);
    if (p.field.minor) {
      const key = fieldIndexKey(p.field.major, p.field.minor);
      minorCounts.set(key, (minorCounts.get(key) ?? 0) + 1);
    }
  }

  return tree.map((entry, i) => ({
    no: String(i + 1).padStart(2, "0"),
    slug: entry.slug,
    major: entry.major,
    count: majorCounts.get(entry.major) ?? 0,
    minors: entry.minors.map((minor) => ({
      name: minor,
      count: minorCounts.get(fieldIndexKey(entry.major, minor)) ?? 0,
    })),
  }));
}

export type RelatedProblem = ProblemMeta & {
  /** 現在の問題と共通するタグの数 */
  tagMatchCount: number;
  /** 大分野（field.major）が一致するか */
  sameMajor: boolean;
};

/**
 * 問題ページ末尾の「関連問題」セクション（#109）用データ。
 *
 * 選定ロジック（PR に明記のこと）:
 *   1. タグ一致数（多い順）
 *   2. 同分野（field.major が一致するものを優先）
 *   3. 新しい順（updated 降順、同値は id 降順）
 * の優先順でソートし、上位 limit 件（既定 5）を返す。
 *
 * 候補はタグ一致数が 1 件以上、または同分野のいずれかを満たすものに限る
 * （「関連が無い場合はセクション自体を出さない」という受け入れ条件を、
 * 呼び出し側で related.length === 0 を判定するだけで満たせるようにする
 * ため）。fields.yaml / tags.yaml の具体的な値には一切依存せず、
 * meta.yaml の実データ（field.major / tags）のみで判定するため、
 * 辞書（#92 / #101）が刷新されても壊れない。
 *
 * status: published のみを対象にする（listPublishedProblems 由来の
 * `all` を渡すこと）。
 */
export function computeRelatedProblems(
  current: ProblemMeta,
  all: ProblemMeta[],
  limit = 5
): RelatedProblem[] {
  const currentTags = new Set(current.tags);

  const candidates: RelatedProblem[] = all
    .filter((p) => p.id !== current.id)
    .map((p) => {
      const tagMatchCount = p.tags.filter((t) => currentTags.has(t)).length;
      const sameMajor = Boolean(current.field.major) && p.field.major === current.field.major;
      return { ...p, tagMatchCount, sameMajor };
    })
    .filter((p) => p.tagMatchCount > 0 || p.sameMajor);

  candidates.sort((a, b) => {
    if (a.tagMatchCount !== b.tagMatchCount) return b.tagMatchCount - a.tagMatchCount;
    if (a.sameMajor !== b.sameMajor) return a.sameMajor ? -1 : 1;
    if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  return candidates.slice(0, limit);
}

// content/ の存在確認だけをこのモジュールでも export しておく
// （呼び出し側で dist-content.ts を経由せずに済ませたいケース向け）。
export { CONTENT_DIR };
