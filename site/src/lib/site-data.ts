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

export const FIELDS_YAML_PATH = path.join(REPO_ROOT, "fields.yaml");

/**
 * fields.yaml をパースし、大分野名の配列を返す。
 * トップレベルキー（インデント無し、`:` で終わる行）だけを拾う簡易実装。
 * YAML パーサへの依存を増やさない方針は dist-content.ts の parseMetaYaml
 * と同じ。
 */
export function listFieldMajors(): string[] {
  if (!fs.existsSync(FIELDS_YAML_PATH)) return [];
  const text = fs.readFileSync(FIELDS_YAML_PATH, "utf-8");
  const majors: string[] = [];
  for (const line of text.split("\n")) {
    // コメント行・空行・インデントされた項目（中分野の "  - foo"）を除く
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
    const m = line.match(/^([^\s#][^:]*):\s*$/);
    if (m) majors.push(m[1].trim());
  }
  return majors;
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
};

/**
 * 検索用の軽量インデックスを生成する。
 * 数式・地の文は含めない（数式検索は仕様外。CLAUDE.md 禁止事項）。
 * フィールド名は id/title/field/sub/tags の 5 つのみ
 * （design/README.md State Management 準拠）。
 */
export function buildSearchIndex(): SearchIndexEntry[] {
  return listPublishedProblems().map((p) => ({
    id: p.id,
    title: p.title,
    field: p.field.major,
    sub: p.field.minor,
    tags: p.tags,
  }));
}

// content/ の存在確認だけをこのモジュールでも export しておく
// （呼び出し側で dist-content.ts を経由せずに済ませたいケース向け）。
export { CONTENT_DIR };
