#!/usr/bin/env node
"use strict";

/**
 * lint/fixtures/meta/ を使って check-meta.js の挙動を検証する。
 *
 * 使い方: node lint/test/run-meta-fixture-tests.js
 */

const { execFileSync } = require("child_process");
const path = require("path");

const LINT_DIR = path.resolve(__dirname, "..");
const SCRIPT = path.join(LINT_DIR, "check-meta.js");
const FIXTURES = path.join(LINT_DIR, "fixtures", "meta");

let failures = 0;

function run(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || "", stderr: err.stderr || "" };
  }
}

function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`NG: ${message}`);
  } else {
    console.log(`OK: ${message}`);
  }
}

// 正常系: exit 0, stderr は空
{
  const target = path.join(FIXTURES, "ok", "0001", "meta.yaml");
  const result = run([target]);
  assert(result.code === 0, "ok/0001/meta.yaml は exit 0 になる");
  assert(result.stderr.trim() === "", "ok/0001/meta.yaml は違反を報告しない");
}

// 異常系: 各違反を検出し exit 1、期待するメッセージ断片を含む
const cases = [
  {
    dir: "missing-key",
    id: "0002",
    expect: ["meta.yaml: updated: 必須キーがありません"],
  },
  {
    dir: "bad-status",
    id: "0003",
    expect: ['meta.yaml: status: draft / published のいずれかが必要です'],
  },
  {
    dir: "bad-difficulty",
    id: "0004",
    expect: ["meta.yaml: difficulty: 1〜5の整数が必要です"],
  },
  {
    dir: "bad-date",
    id: "0005",
    expect: ["meta.yaml: created: 日付は YYYY-MM-DD 形式の実在する日付が必要です"],
  },
  {
    dir: "bad-major",
    id: "0006",
    expect: ["meta.yaml: field.major: \"存在しない分野\" は fields.yaml の大分野にありません"],
  },
  {
    dir: "bad-minor",
    id: "0007",
    expect: ['field.minor: "存在しない中分野" は fields.yaml の "微分積分" 配下にありません'],
  },
  {
    dir: "bad-tag",
    id: "0008",
    expect: ['tags: "存在しないタグ" は tags.yaml にありません'],
  },
  {
    dir: "id-mismatch",
    id: "0009",
    expect: ['id: ディレクトリ名 "0009" と一致しません'],
  },
  {
    dir: "id-not-zero-padded",
    id: "0010",
    expect: ["id: ゼロ埋め4桁の文字列が必要です"],
  },
];

for (const { dir, id, expect } of cases) {
  const target = path.join(FIXTURES, dir, id, "meta.yaml");
  const result = run([target]);
  assert(result.code === 1, `${dir}/${id}/meta.yaml は exit 1 になる`);
  for (const fragment of expect) {
    assert(
      result.stderr.includes(fragment),
      `${dir}/${id}/meta.yaml のエラーに "${fragment}" を含む (実際: ${JSON.stringify(result.stderr.trim())})`
    );
  }
}

// 走査対象が0件（content/ が空）の場合は exit 0
{
  const result = execFileSync("node", [path.join(LINT_DIR, "check-meta.js")], {
    encoding: "utf8",
    cwd: LINT_DIR,
  });
  // execFileSync が例外を投げなければ exit 0
  assert(true, "content/ 走査で違反が無い場合は exit 0（走査対象0件を含む）");
  void result;
}

if (failures > 0) {
  console.error(`\n${failures} 件のテストが失敗しました`);
  process.exit(1);
}
console.log("\nすべてのテストが成功しました");
