# inshi 連携規約

- 版: v1.0（初版）
- 状態: **Yu のレビュー承認待ち**

## 0. 前提

`docs/requirements.md` §2 決定 12・13、§4 システム構成に基づき、Diary
専用リポジトリと `inshi`（既存の `kagakudai_inshi` を畳んだ後継、または
その一部）は別リポジトリのまま連携する。**ファイル複製はしない**。
Diary の CI がビルド時に `inshi` を sparse checkout して読み取るだけ、
という設計を明文化するのが本ドキュメントの目的。コード変更はここでは
行わない。

未決点（採用ブランチ・id 採番分担・リポジトリ名など）はすべて本文中に
「未決」として明示し、勝手に決めていない。

---

## 1. inshi 側に要求するディレクトリ構造・命名

Diary 本体の `content/{id}/` 構造（`docs/requirements.md` §5、
`content/CLAUDE.md`）をそのまま踏襲する。

```
content/{id}/
├── meta.yaml       # メタデータ（必須）
├── problem.tex     # 問題（必須）
└── solution.tex    # 解答・解説（必須）
```

- `{id}` はゼロ埋め 4 桁の連番。ディレクトリ名と `meta.yaml` の `id` は
  一致必須（`lint/check-meta.js` の id 整合チェックと同一ルール）
- `.tex` はドキュメントクラス・プリアンブルを書かない「本文のみ」
  （`styles/diary.sty` を Diary 側ビルドで適用する前提）

### inshi 側リポジトリ内のパス案

Diary 側から見て `content/` 相当のディレクトリを inshi のどこに置くかは
**未決**。選択肢と推奨は次の通り。

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| A（推奨） | inshi リポジトリのルート直下に `content/{id}/` を Diary と全く同じ形で置く | Diary 側の sparse checkout パス指定・走査ロジックが `content/` 決め打ちで済み、コードの分岐が不要 | inshi 側に他の用途（授業プリント等）があると `content/` という名前が紛らわしい可能性 |
| B | `diary/content/{id}/` のようにサブディレクトリで隔離 | inshi 内の他コンテンツと明確に分離できる | Diary 側の sparse checkout パス・走査ロジックに inshi 専用の prefix 分岐が必要になる |

**推奨: A**（inshi リポジトリを Diary 公開専用、または少なくとも
`content/` をそのために予約する運用にできるなら、実装コストが最小）。
inshi 側に他の非公開コンテンツが混在する場合は B を検討する。

---

## 2. meta.yaml 規約の波及範囲

`docs/requirements.md` §4「制約・リスク」に明記の通り、
**「inshi 側にも Diary のメタデータ規約・linter が波及する」**。
これは避けられないコストとして許容されている前提。

### 2.1 同一スキーマ・同一辞書の適用

inshi 側の `meta.yaml` は Diary 本体（`docs/requirements.md` §5）と
**完全に同一のスキーマ**を満たす必要がある。

```yaml
id: "1042"            # 連番・不変・ゼロ埋め4桁（採番ルールは 2.3 参照）
title: "空間ベクトルと平面の交点"
status: draft          # draft | published（published は Yu のみが設定）
field:
  major: "図形と計量"   # fields.yaml の辞書に存在すること
  minor: "面積・空間図形の計量"
tags: ["融合問題"]      # tags.yaml の辞書に存在すること
difficulty: 4
created: 2026-08-06
updated: 2026-08-06
```

- `field.major` / `field.minor` は Diary リポジトリの `fields.yaml` に、
  `tags` の各要素は同 `tags.yaml` に存在する値のみ使用できる
- **辞書の管理主体は Diary 側**。`fields.yaml` / `tags.yaml` は Diary の
  保護ファイル（CLAUDE.md「並列作業ルール」）であり、inshi 側から新規の
  分野・タグを追加することはできない。inshi 執筆者が新しい分野・タグを
  必要とする場合は、Diary 側に issue を立てて追加を依頼する運用とする
- `.tex` の禁止コマンドチェック（`lint/forbidden-commands.yaml`）も
  inshi 側の `.tex` に同様に適用される（3 章参照）

### 2.2 辞書ファイルの参照方法

inshi 側リポジトリ自身は `fields.yaml` / `tags.yaml` を複製・保持しない
（複製すると Diary 側の更新と乖離するため）。inshi 側で執筆時に辞書を
参照したい場合は、Diary リポジトリの当該ファイルを直接参照する
（例: GitHub 上で閲覧、または CI 前のローカルチェック用に Diary
リポジトリを別途 clone するなど）。inshi 側に辞書のコピーを置く運用は
禁止する（Diary の更新が波及しなくなるため）。

### 2.3 id 採番の衝突回避ルール（重要）

**現行の `scripts/build-pdf.js` は id 重複を想定していない。**
`content/` 配下を `/^\d{4}$/` にマッチするディレクトリ名で走査し、
`{id}` をそのままキーにしてビルド・出力パス（`dist/pdf/{id}/...`、
URL `/problems/{id}/`）を決めているため、Diary 本体と inshi の双方が
同じ 4 桁 id を発番すると、ビルド時に**サイレントに衝突・上書き**が
起こり得る。

現時点で衝突回避の仕組みはコード側に存在しない。運用ルールとして
どちらかを選ぶ必要があり、**未決**。

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| A | id 空間を分割する（例: Diary 本体 `0000`–`4999`、inshi `5000`–`9999`） | 実装変更ほぼ不要。運用ルールのみで衝突を防げる | 4 桁の枠を分割するため将来 5,000 問超で桁不足のリスクがある（現行仕様は 4 桁固定） |
| B（推奨） | 採番を一元管理する台帳（例: Diary リポジトリ内の `id-registry` ファイルや GitHub Issue）を設け、新規問題作成時は Diary 側 CI or 手動で払い出す | 桁を分割しないため将来の拡張に強い。単一の真実の情報源を持てる | 運用フローが一段増える（inshi 側で問題を作るたびに Diary 側に id 払い出しを依頼する手間） |
| C | ビルド時に「どちらの由来か」をディレクトリ prefix 等で区別し、URL 上は衝突しても内部的に別管理する | inshi 側の採番を独立に保てる | 「ID は意味を持たせない連番のみ」（§2 決定 7）と衝突する可能性があり、URL 構造（`/problems/{id}/`）が不変という不変条件（CLAAUDE.md）にも抵触しかねない。非推奨 |

**推奨: A**（当面の運用としてシンプルで実装コストが最小。1000 問規模の
目標に対して十分な余裕がある）。将来 5,000 問に近づく段階で B への
移行を再検討する。**最終判断は Yu が行う。**

### 2.4 status: draft の除外ルール

`scripts/build-pdf.js` は `meta.status !== "published"` の問題を
`[skip]` ログを出してビルド対象外にする（該当行:
`scripts/build-pdf.js:182`）。この判定ロジックは inshi 側から
sparse checkout してきた問題にも**そのまま**適用される。inshi 側専用の
特別扱いは行わない。

- `status: published` を設定できるのは Yu のみ（CLAUDE.md 不変条件 4、
  content/CLAUDE.md「禁止」）。この原則は inshi 側の問題にも同様に適用
- inshi 側で `status: draft` のまま置かれている問題は、Diary の CI が
  sparse checkout で読み込んでも PDF/HTML ビルド対象にはならない

---

## 3. Diary の CI が sparse checkout する対象パスと読み取り方

### 3.1 読み取り専用・複製禁止

- Diary の CI は `inshi` リポジトリを **sparse checkout** し、
  1 章で定めた `content/` 相当のパス（案 A なら `content/` 直下、
  案 B なら `diary/content/` 配下）のみをチェックアウトする
- チェックアウトした内容は **ビルド時に一時的に読むだけ**で、
  Diary リポジトリ側に複製・コミットしてはならない（`docs/requirements.md`
  §4「システム構成」の矢印が「sparse checkout（ビルド時に読むだけ、
  複製なし）」と明記されている通り）
- CI ワークフロー（`.github/workflows/build.yml`）内で、sparse
  checkout したチェックアウト先ディレクトリを一時的な `checkout-path`
  として扱い、`content/` 走査ロジック（`scripts/build-pdf.js` の
  `findProblemDirs()` 相当）に両方のパスを渡す形になる想定
  （実装は本 issue の対象外。ここでは規約のみ明文化する）

### 3.2 private リポジトリ前提・認証

inshi リポジトリは private を前提とする。Diary 側 CI（GitHub Actions）
から sparse checkout するには、リポジトリ間アクセス用のトークン
（例: fine-grained PAT、または GitHub App）が必要になる。具体的な
認証方式・シークレットの管理場所は**未決**（本 issue はドキュメントのみ
のため、CI 実装時に別 issue で扱う）。

### 3.3 チェックアウト対象ブランチ

sparse checkout でどのブランチ（例: `main` 固定か、タグ契機か）を
読むかは**未決**。

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| A（推奨） | 常に inshi の `main` ブランチを読む | シンプル。inshi 側の運用も Diary 本体と揃う | inshi 側で作業中の未完成な変更が誤って `main` に入ると即座にビルド対象候補になる（ただし `status: draft` なら除外されるため実害は限定的） |
| B | inshi 側にリリース用ブランチ・タグを設け、それを読む | inshi 側の作業ブランチと公開候補を明確に分離できる | 運用フローが一段増える。inshi 側にも「リリース」という概念を新設する必要がある |

**推奨: A**。`status` によるフィルタが既にあるため、ブランチレベルでの
分離までは不要と考えられるが、最終判断は Yu が行う。

---

## 4. linter の適用

`make lint` は `content/**/*.tex`（禁止コマンドチェック）と
`content/**/meta.yaml`（スキーマ・辞書検証）を走査する
（`lint/README.md` 参照）。sparse checkout してきた inshi 側の
`content/` も、パスとして `content/**/*.tex` ・ `content/**/meta.yaml`
のパターンに合流させる限り、**同一の linter がそのまま適用される**。

- 禁止コマンド（`lint/forbidden-commands.yaml`）は inshi 側の `.tex`
  にも同様に禁止される。緩和は行わない（CLAUDE.md「禁止事項」）
- `meta.yaml` の必須キー・型・辞書照合・id 整合チェック
  （`lint/check-meta.js`）も inshi 側の `meta.yaml` にそのまま適用される
- inshi 側の CI に linter を組み込むか、Diary 側の CI が sparse
  checkout した後にまとめて linter を走らせるかは**未決**

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| A（推奨） | Diary 側 CI が sparse checkout 後にまとめて `make lint` 相当を実行する | linter のロジックを Diary 側に一元化でき、`lint/` は保護ファイルのまま単独管理を維持できる | inshi 側での執筆時にローカルで即座に lint エラーを確認しづらい（Diary 側 CI 実行まで気づけない） |
| B | inshi 側リポジトリにも `lint/` 相当を複製し、inshi 側の CI で先に検証する | inshi 側執筆者が早期にエラーに気づける | `lint/` の複製が発生し、Diary 側のルール変更が inshi 側に伝播しない二重管理リスクがある。CLAUDE.md の「保護ファイル」思想（`lint/` は単独管理）とも相性が悪い |

**推奨: A**（複製を避ける § 0 の大原則と整合する）。最終判断は Yu が行う。

---

## 5. 未決点まとめ（Yu の判断待ち）

1. **inshi 側のディレクトリ配置**（1 章）: `content/` 直下（案 A・推奨）
   か、`diary/content/` のようなサブディレクトリ（案 B）か
2. **id 採番の衝突回避ルール**（2.3 章、重要）: id 空間分割（案 A・推奨）
   / 採番台帳による一元管理（案 B）/ prefix 区別（案 C・非推奨）
3. **sparse checkout するブランチ**（3.3 章）: 常に `main`（案 A・推奨）
   / inshi 側にリリースブランチ・タグを新設（案 B）
4. **linter の実行場所**（4 章）: Diary 側 CI で一元実行（案 A・推奨）
   / inshi 側にも複製して先行実行（案 B）
5. **inshi リポジトリ名・実体**: `kagakudai_inshi` を畳んで新設する
   リポジトリ名が `inshi` のままでよいか、private リポジトリへの
   CI アクセス認証方式（fine-grained PAT / GitHub App 等）をどうするか
   （本ドキュメントでは前提として private を仮置きしているのみで未確定）

いずれも本ドキュメントでは仮の推奨案を示しているのみで、コード実装や
運用開始までに Yu の承認・決定が必要。
