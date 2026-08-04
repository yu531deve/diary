新しい問題の雛形を作成してください。

1. `content/` 配下の既存最大 ID を調べ、+1 したゼロ埋め 4 桁を新 ID とする
2. `content/{新ID}/` に meta.yaml（status: draft、created/updated は今日）、problem.tex、solution.tex の雛形を作成
3. meta.yaml のスキーマは content/CLAUDE.md に従う
4. 作成後、`make lint` を実行して通ることを確認する
