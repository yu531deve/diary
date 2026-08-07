# デプロイ手順（Cloudflare Pages）

#29 で GitHub Actions 側の自動デプロイは実装済み。ここに書かれた Yu の手作業（Cloudflare
アカウント作成〜GitHub Secrets 登録）が終わるまで、main に push しても実際のデプロイは
行われない（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が未登録だと deploy ジョブが
失敗するだけで、PR の CI（build ジョブ）には影響しない）。

## 全体の流れ

1. Cloudflare アカウント作成
2. Pages プロジェクト作成（Direct Upload 方式）
3. API トークン発行
4. Account ID の確認
5. GitHub Secrets への登録
6. 動作確認（main へ push → Actions → 公開 URL）

---

## 1. Cloudflare アカウント作成

1. https://dash.cloudflare.com/sign-up にアクセスし、メールアドレスとパスワードで登録する
2. 確認メールのリンクをクリックしてメール認証を済ませる
3. **クレジットカード登録は不要**。Cloudflare Pages は無料プラン（Free）で以下がカバーされる
   - ビルド成果物の Direct Upload によるホスティング
   - 月 500 回までのデプロイ（このリポジトリは push 頻度的に十分収まる想定）
   - 帯域無制限
   - 今回は Wrangler での Direct Upload 方式を使うため、Cloudflare 側の「Pages ビルド」枠
     （月 500 分）も消費しない
4. 支払い方法の入力を求められる画面が出ても、無料プランのままであればスキップして進める

## 2. Pages プロジェクト作成（Direct Upload 方式）

Git 連携（Cloudflare がリポジトリを直接 clone してビルドする方式）ではなく、
GitHub Actions からビルド済みの `site/dist` を `wrangler pages deploy` でアップロードする
**Direct Upload 方式**を使う（理由は PR 本文を参照）。

1. Cloudflare ダッシュボード左メニューから **Workers & Pages** を開く
2. **Create application** → **Pages** タブ → **Upload assets** を選ぶ
   （「Connect to Git」ではなく「Direct Upload」系の導線を選ぶこと）
3. プロジェクト名を `diary` にする（ワークフロー側の `--project-name=diary` と一致させる。
   別名にしたい場合は `.github/workflows/build.yml` の deploy ジョブ内
   `--project-name=diary` も同じ値に書き換える）
4. 初回アップロードを求められた場合、空でよいので適当な HTML ファイル（例: 中身が
   `<html></html>` だけの `index.html`）を 1 つアップロードしてプロジェクトを作成する
   （実際の中身は初回の GitHub Actions デプロイで上書きされる）
5. 作成後の URL（`https://diary-xxx.pages.dev` 形式、またはプロジェクト設定で確認できる
   `https://diary.pages.dev`）を控えておく（動作確認で使う）

## 3. API トークン発行

1. Cloudflare ダッシュボード右上のアカウントアイコン → **My Profile** → **API Tokens**
2. **Create Token** をクリック
3. テンプレート一覧から **Edit Cloudflare Workers** ではなく、**Cloudflare Pages** 用の
   権限を個別設定する（"Custom token" を選び、以下を指定）
   - Permissions: **Account** / **Cloudflare Pages** / **Edit**
   - Account Resources: **Include** / （対象アカウントを選択）
   - Zone Resources は今回不要（Pages の Direct Upload に DNS ゾーン操作は不要）
4. **Continue to summary** → **Create Token**
5. 表示されたトークン文字列をコピーする（**この画面を閉じると二度と表示されない**ので
   コピーし忘れないこと。次の手順ですぐ GitHub Secrets に貼り付ける）

## 4. Account ID の確認

1. Cloudflare ダッシュボードで任意のドメイン、または **Workers & Pages** の概要画面を開く
2. 右側のサイドバーに **Account ID** が表示されている（32 桁の英数字）
3. これをコピーする

## 5. GitHub Secrets への登録

1. GitHub の本リポジトリ → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** で以下 2 つを登録する

   | Name | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | 手順 3 で発行したトークン |
   | `CLOUDFLARE_ACCOUNT_ID` | 手順 4 で確認した Account ID |

3. 値の貼り付けミス（前後の空白・改行）に注意する

## 6. 登録後の確認手順

1. main ブランチに何かしら push する（このタスクの PR をマージすれば main への push になる）
2. GitHub の **Actions** タブを開き、`build` ワークフローの実行を確認する
   - `build` ジョブが緑になること
   - 続けて `deploy` ジョブが実行され、緑になること（PR 時点ではこのジョブ自体が
     スキップされ、main への push でのみ現れる）
3. `deploy` ジョブのログに Cloudflare Pages のデプロイ URL が出力されるので開く。
   または手順 2 で控えた `https://diary.pages.dev`（もしくはプロジェクト設定に表示される
   URL）に直接アクセスする
4. トップページ・問題ページ・解答ページなど、サイトの主要な複数ページが表示されることを
   目視で確認する

---

## 将来の節（未決事項）

### 独自ドメイン

独自ドメインの設定は本 issue の対象外・未決事項。決定後にこの節へ追記する。
