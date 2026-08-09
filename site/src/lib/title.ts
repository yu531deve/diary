// meta.yaml の title は LaTeX（\diarytitle{...}）を正として扱う（#227 の方針）。
// PDF 側は #228 で数式部分を `$...$` で囲んで解決したが、HTML 側では
// `$` や `\sqrt` `^{...}` 等の LaTeX 記法がそのまま表示されてしまう。
//
// このモジュールは meta.yaml の title 文字列（LaTeX 混じり）を、
// 表示用のプレーンテキストに変換する唯一の場所。
// content/ と meta.yaml のスキーマは変更しない方針（#227）のため、
// 変換はすべて site 側のこのヘルパーに閉じる。
//
// 変換方針（README 相当）:
//   1. `$...$` の `$` を除去する
//   2. `\sqrt{X}` → ` sqrt(X)`
//   3. `^{X}` / `_{X}` → 中身が英数字のみなら括弧を外す（x^{2} → x^2）、
//      演算子等を含むなら `^(X)` / `_(X)` に変換（e^{-x} → e^(-x)）
//   4. `\sin` `\cos` `\tan` `\arcsin` `\arctan` `\log` `\ln` `\alpha` 等の
//      LaTeX コマンドはバックスラッシュを外して関数名だけ残す
//   5. `\cdot` → `*`、`\dots`/`\cdots` → `...`、`\left`/`\right` → 除去、
//      `\\`（LaTeX 改行）→ 空白
//   6. 残った `{` `}` を除去し、連続空白を 1 個に畳んで trim
//
// 数式を含まないタイトル（$ を含まない）は上記のいずれの置換にも
// マッチしないため、入力のまま返る（受け入れ条件: 84 問は無変更）。

function replaceBalancedBraceGroup(
  input: string,
  command: string,
  render: (inner: string) => string
): string {
  const marker = `\\${command}{`;
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (input.startsWith(marker, i)) {
      const contentStart = i + marker.length;
      let depth = 1;
      let j = contentStart;
      while (j < input.length && depth > 0) {
        if (input[j] === "{") depth++;
        else if (input[j] === "}") depth--;
        j++;
      }
      const inner = input.slice(contentStart, j - 1);
      result += render(inner);
      i = j;
    } else {
      result += input[i];
      i++;
    }
  }
  return result;
}

/**
 * meta.yaml の title（LaTeX 混じり）を表示用プレーンテキストに変換する。
 * `<title>` / OGP / 検索インデックス / issue URL / 一覧・見出し・カード等、
 * title を表示するすべての箇所からこの関数を使うこと。
 */
export function formatMathTitle(raw: string): string {
  if (!raw || !raw.includes("$")) return raw;

  let s = raw;

  // $ そのものは除去（数式境界の意味は失われるが、以降の変換で読める形にする）
  s = s.replace(/\$/g, "");

  // LaTeX の改行コマンド \\ はスペースに
  s = s.replace(/\\\\/g, " ");

  // \left \right は除去（括弧の高さ調整のみのコマンドなので中身の () はそのまま残る）
  s = s.replace(/\\left|\\right/g, "");

  // \sqrt{X} → " sqrt(X)"
  s = replaceBalancedBraceGroup(s, "sqrt", (inner) => ` sqrt(${inner})`);

  // ^{X} / _{X}: 中身が英数字のみなら括弧を外す。それ以外は ^(X) / _(X)
  s = s.replace(/([\^_])\{([^{}]*)\}/g, (_m, marker: string, inner: string) => {
    if (/^[A-Za-z0-9]+$/.test(inner)) return `${marker}${inner}`;
    return `${marker}(${inner})`;
  });

  // \cdot → *、\dots \cdots → ...
  s = s.replace(/\\cdots|\\ldots|\\dots/g, "...");
  s = s.replace(/\\cdot/g, "*");

  // 残りの LaTeX コマンド（\sin \cos \tan \arcsin \arctan \log \ln \alpha 等）
  // はバックスラッシュを外して関数・記号名だけ残す
  s = s.replace(/\\([a-zA-Z]+)/g, " $1");

  // 残った波括弧は除去（グルーピングの意味のみだったもの）
  s = s.replace(/[{}]/g, "");

  // 連続空白を 1 個に畳んで trim
  s = s.replace(/\s+/g, " ").trim();

  // "(" 直後 / ")" 直前の余分な空白を除去（\alpha 等の展開で
  // "x^( alpha)" のように入り込む見た目上のノイズを消すだけの整形）
  s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

  return s;
}
