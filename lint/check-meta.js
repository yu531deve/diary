#!/usr/bin/env node
"use strict";

/**
 * content/**\/meta.yaml のスキーマ検証・辞書照合・id 整合チェック（M0-4b）。
 *
 * 検証内容（docs/requirements.md §5 準拠）:
 *   - 必須キー: id, title, status, field.major, field.minor, tags,
 *     difficulty, created, updated
 *   - status は draft | published のいずれか
 *   - difficulty は 1〜5 の整数
 *   - created / updated は YYYY-MM-DD 形式の日付
 *   - field.major / field.minor が fields.yaml に存在すること
 *   - tags の各要素が tags.yaml に存在すること
 *   - id がディレクトリ名と一致し、ゼロ埋め 4 桁の文字列であること
 *
 * 使い方:
 *   node lint/check-meta.js                    # content 以下の meta.yaml をすべて走査
 *   node lint/check-meta.js <file...>           # 指定ファイルのみ走査（fixtures 用）
 *
 * 違反があれば stderr に "ファイル: キー: 理由" を1行1違反で出力し、exit 1 する。
 * 違反がなければ（走査対象が0件の場合を含む）exit 0。
 *
 * M0-2 の lint/validate_meta.py（Python 版）を Node 実装へ統合したもの。
 * 検証内容は引き継ぎつつ、check-forbidden-commands.js と同じ CLI 規約
 * （引数なしなら content/ 全走査、引数ありならそのファイルのみ）に揃えている。
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const REPO_ROOT = path.resolve(__dirname, "..");
const ID_RE = /^\d{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["draft", "published"];
const REQUIRED_KEYS = [
  "id",
  "title",
  "status",
  "field",
  "tags",
  "difficulty",
  "created",
  "updated",
];

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function loadDicts() {
  // fields.yaml は #92 で `{major: [minors]}` のマップ構造から
  // `- slug / name / minors` のリスト構造に変わった。ここでは呼び出し側
  // （field.major / field.minor の存在チェック）の互換性のため、
  // 引き続き `{ major名: [minor名, ...] }` のマップに変換して返す。
  const fieldsList =
    yaml.load(fs.readFileSync(path.join(REPO_ROOT, "fields.yaml"), "utf8")) ||
    [];
  const fields = {};
  for (const entry of fieldsList) {
    if (entry && typeof entry.name === "string") {
      fields[entry.name] = Array.isArray(entry.minors) ? entry.minors : [];
    }
  }
  const tags =
    yaml.load(fs.readFileSync(path.join(REPO_ROOT, "tags.yaml"), "utf8")) ||
    [];
  return { fields, tags };
}

function findMetaFilesUnder(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        stack.push(path.join(current, child));
      }
    } else if (stat.isFile() && path.basename(current) === "meta.yaml") {
      results.push(current);
    }
  }
  return results;
}

// created/updated が有効な暦日かどうかを検証する（例: 2026-02-30 を弾く）。
function isValidCalendarDate(str) {
  const m = DATE_RE.exec(str);
  if (!m) return false;
  const [y, mo, d] = str.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

function checkDate(errors, data, key) {
  if (!(key in data)) return; // 必須キー欠如は呼び出し側で報告済み
  const v = data[key];
  let str;
  if (v instanceof Date) {
    // js-yaml は YYYY-MM-DD をタイムスタンプとして Date にパースする。
    const iso = v.toISOString();
    str = iso.slice(0, 10);
    if (iso.slice(11) !== "00:00:00.000Z") {
      errors.push(`${key}: 日付は YYYY-MM-DD 形式が必要です: ${JSON.stringify(v)}`);
      return;
    }
  } else if (typeof v === "string") {
    str = v;
  } else {
    errors.push(`${key}: 日付（YYYY-MM-DD）が必要です: ${JSON.stringify(v)}`);
    return;
  }
  if (!DATE_RE.test(str) || !isValidCalendarDate(str)) {
    errors.push(`${key}: 日付は YYYY-MM-DD 形式の実在する日付が必要です: ${JSON.stringify(v)}`);
  }
}

function validateFile(filePath, fields, tags) {
  let data;
  try {
    data = yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return [`YAML として読めません: ${e.message}`];
  }
  if (!isPlainObject(data)) {
    return ["YAML のトップレベルが辞書ではありません"];
  }

  const errors = [];

  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) {
      errors.push(`${key}: 必須キーがありません`);
    }
  }

  // id: ゼロ埋め4桁の文字列、かつディレクトリ名と一致すること
  if ("id" in data) {
    const id = data.id;
    if (typeof id !== "string" || !ID_RE.test(id)) {
      errors.push(
        `id: ゼロ埋め4桁の文字列が必要です（例 "0042"）: ${JSON.stringify(id)}`
      );
    } else {
      const dirName = path.basename(path.dirname(filePath));
      if (dirName !== id) {
        errors.push(
          `id: ディレクトリ名 "${dirName}" と一致しません: ${JSON.stringify(id)}`
        );
      }
    }
  }

  // title
  if ("title" in data) {
    if (typeof data.title !== "string" || data.title.trim() === "") {
      errors.push(`title: 空でない文字列が必要です: ${JSON.stringify(data.title)}`);
    }
  }

  // status
  if ("status" in data) {
    if (!STATUSES.includes(data.status)) {
      errors.push(
        `status: ${STATUSES.join(" / ")} のいずれかが必要です: ${JSON.stringify(
          data.status
        )}`
      );
    }
  }

  // field.major / field.minor
  if ("field" in data) {
    const field = data.field;
    if (!isPlainObject(field)) {
      errors.push(`field: major / minor を持つ辞書が必要です: ${JSON.stringify(field)}`);
    } else {
      const { major, minor } = field;
      if (major === undefined) {
        errors.push("field.major: 必須キーがありません");
      } else if (!Object.prototype.hasOwnProperty.call(fields, major)) {
        errors.push(
          `field.major: ${JSON.stringify(major)} は fields.yaml の大分野にありません`
        );
      } else {
        const minors = fields[major] || [];
        if (minor === undefined) {
          errors.push("field.minor: 必須キーがありません");
        } else if (!minors.includes(minor)) {
          errors.push(
            `field.minor: ${JSON.stringify(
              minor
            )} は fields.yaml の "${major}" 配下にありません（登録済み: ${minors.join(
              ", "
            )}）`
          );
        }
      }
    }
  }

  // tags
  if ("tags" in data) {
    const tagList = data.tags;
    if (!Array.isArray(tagList)) {
      errors.push(`tags: リストが必要です（空リスト可）: ${JSON.stringify(tagList)}`);
    } else {
      for (const t of tagList) {
        if (!tags.includes(t)) {
          errors.push(`tags: ${JSON.stringify(t)} は tags.yaml にありません`);
        }
      }
    }
  }

  // difficulty
  if ("difficulty" in data) {
    const d = data.difficulty;
    if (!Number.isInteger(d) || d < 1 || d > 5) {
      errors.push(`difficulty: 1〜5の整数が必要です（基準: docs/difficulty.md）: ${JSON.stringify(d)}`);
    }
  }

  checkDate(errors, data, "created");
  checkDate(errors, data, "updated");

  return errors;
}

function run(args) {
  const { fields, tags } = loadDicts();
  const targets =
    args && args.length > 0
      ? args
      : findMetaFilesUnder(path.join(REPO_ROOT, "content"));

  let allErrors = [];
  for (const target of targets) {
    const relative = path.relative(REPO_ROOT, target) || target;
    const errors = validateFile(target, fields, tags);
    for (const e of errors) {
      allErrors.push(`${relative}: ${e}`);
    }
  }

  for (const e of allErrors) {
    process.stderr.write(`${e}\n`);
  }

  if (allErrors.length > 0) {
    return 1;
  }

  process.stdout.write(`check-meta: ${targets.length} 件の meta.yaml を検証 (OK)\n`);
  return 0;
}

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}

module.exports = { run, validateFile, findMetaFilesUnder, loadDicts };
