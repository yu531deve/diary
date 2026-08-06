#!/usr/bin/env node
"use strict";

/**
 * content 以下の .tex ファイルを走査し、forbidden-commands.yaml に列挙
 * された禁止 LaTeX コマンドの使用を検出する。
 *
 * 使い方:
 *   node lint/check-forbidden-commands.js               # content 以下を走査
 *   node lint/check-forbidden-commands.js <file...>      # 指定ファイルのみ走査（fixtures 用）
 *
 * 違反があれば stderr に "ファイル:行番号: forbidden command \\コマンド名"
 * を1行1違反で出力し、exit 1 する。違反がなければ exit 0。
 * 走査対象が1つも見つからない場合も exit 0 とする。
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const REPO_ROOT = path.resolve(__dirname, "..");
const RULES_PATH = path.join(__dirname, "forbidden-commands.yaml");

function loadForbiddenCommands() {
  const raw = fs.readFileSync(RULES_PATH, "utf8");
  const data = yaml.load(raw);
  if (!data || !Array.isArray(data.forbidden)) {
    throw new Error(`${RULES_PATH} に forbidden 配列が見つかりません`);
  }
  return data.forbidden.map((entry) => entry.name);
}

function findTexFilesUnder(dir) {
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
    } else if (stat.isFile() && current.endsWith(".tex")) {
      results.push(current);
    }
  }
  return results;
}

// コメント (% 以降) を除去する。ただし \% はエスケープなので
// コメント開始とはみなさない。
function stripComment(line) {
  let backslashRun = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") {
      backslashRun++;
      continue;
    }
    if (ch === "%") {
      // 直前の連続バックスラッシュが奇数なら、この % はエスケープ
      // (\%) されており、コメント開始ではない。
      if (backslashRun % 2 === 1) {
        backslashRun = 0;
        continue;
      }
      return line.slice(0, i);
    }
    backslashRun = 0;
  }
  return line;
}

function buildCommandRegex(name) {
  // \name の直後に英数字が続く場合は別コマンド（例: \inputxyz）とみなし
  // マッチさせない。
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\\\${escaped}(?![a-zA-Z0-9])`, "g");
}

function checkFile(filePath, commandRegexes) {
  const violations = [];
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const line = stripComment(rawLine);
    for (const { name, regex } of commandRegexes) {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        violations.push({ file: filePath, line: idx + 1, command: name });
      }
    }
  });
  return violations;
}

function main() {
  const args = process.argv.slice(2);
  const forbiddenNames = loadForbiddenCommands();
  const commandRegexes = forbiddenNames.map((name) => ({
    name,
    regex: buildCommandRegex(name),
  }));

  let targets;
  if (args.length > 0) {
    targets = args;
  } else {
    targets = findTexFilesUnder(path.join(REPO_ROOT, "content"));
  }

  let allViolations = [];
  for (const target of targets) {
    const relative = path.relative(REPO_ROOT, target) || target;
    allViolations = allViolations.concat(
      checkFile(target, commandRegexes).map((v) => ({ ...v, file: relative }))
    );
  }

  if (allViolations.length > 0) {
    for (const v of allViolations) {
      process.stderr.write(`${v.file}:${v.line}: forbidden command \\${v.command}\n`);
    }
  }

  // Makefile の `lint` ターゲットはこのスクリプトのみを呼ぶ単一コマンドの
  // ため、引数なしの通常走査時（= `make lint`）に限り、meta.yaml の
  // スキーマ検証・辞書照合・id 整合チェック（check-meta.js）もあわせて
  // 実行し、このスクリプトを lint 一式のまとめ役とする。
  // 引数ありの fixture テスト実行時は禁止コマンドチェックの検証に
  // 専念させるため実行しない。
  let metaExitCode = 0;
  if (args.length === 0) {
    const checkMeta = require("./check-meta.js");
    metaExitCode = checkMeta.run([]);
  }

  process.exit(allViolations.length > 0 || metaExitCode !== 0 ? 1 : 0);
}

main();
