#!/usr/bin/env node
"use strict";

/**
 * lint/fixtures/ を使って check-forbidden-commands.js の挙動を検証する。
 *
 * 使い方: node lint/test/run-fixture-tests.js
 */

const { execFileSync } = require("child_process");
const path = require("path");

const LINT_DIR = path.resolve(__dirname, "..");
const SCRIPT = path.join(LINT_DIR, "check-forbidden-commands.js");
const FIXTURES = path.join(LINT_DIR, "fixtures");

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
  const result = run([path.join(FIXTURES, "ok.tex")]);
  assert(result.code === 0, "ok.tex は exit 0 になる");
  assert(result.stderr.trim() === "", "ok.tex は違反を報告しない");
}

// 異常系: 各禁止コマンドを検出し exit 1、ファイル名・行番号・コマンド名を表示する
const cases = [
  { file: "write18.tex", command: "write18", line: 3 },
  { file: "input.tex", command: "input", line: 3 },
  { file: "include.tex", command: "include", line: 3 },
  { file: "usepackage.tex", command: "usepackage", line: 3 },
];

for (const { file, command, line } of cases) {
  const target = path.join(FIXTURES, file);
  const result = run([target]);
  assert(result.code === 1, `${file} は exit 1 になる`);
  const expectedFragment = `fixtures/${file}:${line}: forbidden command \\${command}`;
  assert(
    result.stderr.includes(expectedFragment),
    `${file} はエラーメッセージに "${expectedFragment}" を含む (実際: ${JSON.stringify(result.stderr.trim())})`
  );
}

// input.tex は \% エスケープ後の \input も4行目で検出される
{
  const target = path.join(FIXTURES, "input.tex");
  const result = run([target]);
  assert(
    result.stderr.includes("fixtures/input.tex:4: forbidden command \\input"),
    "input.tex はエスケープされた % の後の \\input も検出する"
  );
}

if (failures > 0) {
  console.error(`\n${failures} 件のテストが失敗しました`);
  process.exit(1);
}
console.log("\nすべてのテストが成功しました");
