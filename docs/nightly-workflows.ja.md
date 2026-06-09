# 深夜プロジェクト自動運用ワークフロー集（10案）

> このスケジューラ（`claude-schedule-management`）を「開発タスクの夜間自律運用基盤」として
> 使うための、実践的なワークフロー設計集です。GitHub の issue / Projects と、
> Claude・Gemini・Codex というマルチ LLM の特性を組み合わせ、
> あなたが寝ている間にプロジェクトを前進させることを狙います。

🇬🇧 English version: _not yet translated_ — see the Japanese version below.

---

## このドキュメントの前提

- ジョブ本体は `jobs/<name>.yaml`（[`jobs/examples/`](../jobs/examples) を参照）。
- 1ジョブ = 1スケジュール = 1プロンプト = 1プロバイダ（`claude` / `gemini` / `codex`）。
- LLM が GitHub を操作する手段は、ワーキングディレクトリ内で **`gh` CLI**
  （または GitHub MCP）を呼ぶこと。事前に `gh auth login` 済みであること。
- 無人実行なので **権限戦略**（[README の該当節](../README.md#scheduled-job-permission-strategy)）を
  必ず明示し、`timeout_seconds` を保険として設定する。
- 深夜帯（例: 1:00〜5:00）は API レート・電気代・人的割り込みが少なく、自律実行に向く。

### マルチ LLM の使い分け指針

各案はこの特性表を前提に LLM を割り当てています。

| LLM        | 得意領域                                                     | 夜間ワークフローでの主な役割                   |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------- |
| **Claude** | 深い推論・設計判断・コードレビュー・自然言語の質             | 計画立案、レビュー、最終判断、文章生成         |
| **Gemini** | 大規模コンテキスト・要約・Web/リサーチ・低コスト大量処理     | 一次トリアージ、大量ログ/差分の要約、調査       |
| **Codex**  | 自律的なコード編集・テスト実行・サンドボックス内の試行錯誤   | 実装、テスト修正、依存更新などの「手を動かす」係 |

> マルチ LLM 運用の肝は **「役割分担」と「クロスチェック」**。安いモデルで広く拾い、
> 賢いモデルで深く判断し、別モデルで検算する、という流れを各案に落とし込んでいます。

### ジョブの連鎖（チェイニング）について

このスケジューラは「単発 cron 実行」が基本で、ジョブ間の依存関係を直接は持ちません。
夜間に多段パイプラインを組むときは、次のいずれかで連鎖させます。

1. **時間オフセット連鎖** — `1:00` で A、`2:00` で B のように開始時刻をずらす（最も単純で堅牢）。
2. **GitHub を状態ストアにする** — A が issue / ラベル / Projects フィールドを更新し、
   B はそれを読んで続きを処理する（疎結合で再実行に強い。本ドキュメントの推奨）。
3. **作業ディレクトリ内のファイル** — A が `.nightly/state.json` 等を書き、B が読む。

各案では主に **2（GitHub を状態ストアにする）** を採用しています。
これなら朝、あなたが GitHub を見るだけで一晩の経緯を追跡できます。

---

## 案の一覧

| #   | ワークフロー                            | 主役 LLM             | GitHub 連携                       |
| --- | --------------------------------------- | -------------------- | --------------------------------- |
| 1   | 夜間 Issue トリアージ & 自動ラベリング   | Gemini → Claude      | Issues, Labels, Projects          |
| 2   | Issue → ドラフト PR 自動生成パイプライン | Claude → Codex       | Issues, PR, Projects              |
| 3   | 夜間テストトリアージ & 自動修正          | Codex → Claude       | PR, Checks                        |
| 4   | 依存関係ナイトリー更新 & 互換性検証      | Codex → Claude       | PR, Dependabot 補完               |
| 5   | PR レビュー bot（夜間消化）              | Gemini → Claude      | Pull Requests, Reviews            |
| 6   | 技術的負債の棚卸し & Issue 自動起票      | Claude               | Issues, Projects                  |
| 7   | ドキュメント同期 & 整合性チェック        | Gemini → Claude      | PR, Issues                        |
| 8   | 技術リサーチ・ダイジェスト配信          | Gemini → Claude      | Issues（ダイジェスト投稿）         |
| 9   | Projects ボード健全性レポート & 朝の計画 | Claude               | Projects, Issues                  |
| 10  | マルチ LLM クロスチェック監査            | Claude + Codex + Gemini | Issues, PR Reviews            |

---

## 案1: 夜間 Issue トリアージ & 自動ラベリング

**目的:** 日中に溜まった新規 issue を、朝には「分類・優先度付け・担当候補」まで終わった
状態にする。

**LLM 配置（2段・時間オフセット連鎖）:**

- **1:00 / Gemini** — 大量コンテキストと低コストを活かし、未ラベルの全 issue を読み、
  `type:bug` / `type:feature` / `area:*` などの一次ラベルを付与。重複候補も検出。
- **1:30 / Claude** — `needs-triage` が残った「判断の難しい issue」だけを深掘りし、
  優先度（`P0`〜`P3`）・再現性・影響範囲をコメントし、Projects の `Status` を更新。

**Gemini ジョブ例:**

```yaml
name: nightly-issue-triage-gemini
description: 新規 issue の一次ラベリング（Gemini）
enabled: true
schedule:
  cron: "0 1 * * *" # 毎日 1:00
working_directory: /Users/you/projects/your-repo
prompt: |
  `gh issue list --label "" --state open --json number,title,body` で
  未ラベルの open issue を取得し、各 issue について:
    1. type ラベル（type:bug / type:feature / type:question / type:docs）を判定
    2. 関連する area ラベルを推定（既存ラベルは `gh label list` で確認）
    3. 既存 issue との重複候補があれば本文に "possible duplicate of #N" とコメント
    4. 判断が難しいものは `needs-triage` を残す
  ラベル付与は `gh issue edit <n> --add-label ...` で行う。破壊的操作はしない。
provider: gemini
claude_args: ["--approval-mode", "auto_edit", "-p"]
timeout_seconds: 900
```

**Claude ジョブ例:**

```yaml
name: nightly-issue-triage-claude
description: 難判定 issue の深掘りトリアージ（Claude）
enabled: true
schedule:
  cron: "30 1 * * *" # 毎日 1:30（Gemini の後）
working_directory: /Users/you/projects/your-repo
prompt: |
  `gh issue list --label needs-triage --state open` の各 issue について、
  必要ならコードを読んで再現性・影響範囲を評価し、優先度ラベル(P0..P3)を付与。
  根拠を1コメントで残し、Projects の Status を "Triaged" に更新。
  確信が持てないものは needs-triage を残し、理由を書く。
provider: claude
claude_args: ["-p", "--allowedTools", "Read,Grep,Glob,Bash(gh:*)"]
timeout_seconds: 900
```

**注意:** ラベルの新規作成は避け、既存ラベル体系に従わせる。重複判定は「コメント提案」に留め、
自動クローズはさせない。

---

## 案2: Issue → ドラフト PR 自動生成パイプライン

**目的:** `ready-for-agent` ラベルの付いた小粒な issue を、夜のうちに
「実装方針 → 実装 → ドラフト PR」まで進め、朝はレビューから始められるようにする。

**LLM 配置（3段・GitHub 状態連鎖）:**

- **2:00 / Claude（plan mode）** — issue を読み、設計・変更ファイル・受け入れ条件を
  issue コメントに「実装プラン」として投稿。`agent-planned` ラベルへ。
- **2:30 / Codex（full-auto）** — `agent-planned` の issue のプランに沿って実装し、
  ブランチを切ってドラフト PR を作成。`agent-implemented` ラベルへ。
- **3:00 / Claude** — 生成された PR を自己レビューし、懸念点を PR にコメント
  （案5と統合してもよい）。

**Codex ジョブ例（実装担当）:**

```yaml
name: nightly-issue-to-pr-codex
description: プラン済み issue を実装しドラフト PR を作る（Codex）
enabled: true
schedule:
  cron: "30 2 * * *"
working_directory: /Users/you/projects/your-repo
prompt: |
  `gh issue list --label agent-planned --state open` の先頭1件を選び:
    1. issue 本文の「実装プラン」コメントに従って実装
    2. `git switch -c agent/issue-<n>` でブランチ作成
    3. テストがあれば実行して通す
    4. `gh pr create --draft --title "..." --body "Closes #<n>" ...`
    5. issue のラベルを agent-planned → agent-implemented に張り替え
  プランから逸脱が必要なら実装せず issue にコメントして停止。1晩1件のみ。
provider: codex
claude_args: ["--full-auto"]
timeout_seconds: 1800
```

**注意:** 必ず **draft PR** にし、`--full-auto` でも `main` への直接 push はさせない
（ブランチ運用を徹底）。対象 issue は「明確で小粒」なものに限定するラベル運用が成功の鍵。
1晩1件に絞ると暴走時の被害が限定的。

---

## 案3: 夜間テストトリアージ & 自動修正

**目的:** flaky/失敗テストを朝までに「原因要約 + 最小修正案（or 修正済みドラフト PR）」にする。
[`codex-nightly-tests.yaml`](../jobs/examples/codex-nightly-tests.yaml) の発展版。

**LLM 配置（2段）:**

- **2:00 / Codex（full-auto）** — テストスイートを実行。失敗があれば原因を切り分け、
  「明らかなコード/テストのバグ」は最小修正してブランチ + ドラフト PR を作成。
- **2:45 / Claude** — Codex が作った修正 PR を**レビュー**し、修正が症状でなく
  原因に当たっているか、過剰修正でないかを判定してコメント。疑わしければ
  `needs-human` ラベルを付ける。

**ポイント:** 「直す Codex」と「疑う Claude」を分けることで、自動修正の暴走を抑える。
Codex 単独だとテストを通すために実装ロジックを歪めることがあるため、別 LLM のレビューが効く。

```yaml
name: nightly-test-fix-codex
description: 失敗テストの原因切り分けと最小修正
enabled: true
schedule:
  cron: "0 2 * * *"
working_directory: /Users/you/projects/your-repo
prompt: |
  テストスイートを実行。全パスなら "all green" とだけ出力して終了。
  失敗があれば:
    - 失敗ごとに原因を1段落で要約
    - テスト自体の誤り or 明白なコードバグのみ、最小差分で修正
    - 仕様変更が絡む/自信がない失敗は触らず列挙
  修正した場合は agent/test-fix-<date> ブランチでドラフト PR を作成し、
  本文に「触った失敗 / 触らなかった失敗と理由」を記載。
provider: codex
claude_args: ["--full-auto"]
timeout_seconds: 1800
```

---

## 案4: 依存関係ナイトリー更新 & 互換性検証

**目的:** Dependabot が出す PR の「実際に動くのか？」という空白を、夜間に埋める。
更新 → テスト → 移行メモまでを自動化。

**LLM 配置（2段）:**

- **3:00 / Codex** — マイナー/パッチ更新を適用（`npm update` 等）、ビルド & テストを実行。
  グリーンなら `deps/nightly-<date>` ブランチでドラフト PR を作成。
- **3:40 / Claude** — 破壊的変更を含むメジャー更新については、各ライブラリの
  CHANGELOG/移行ガイドを読み（Web 検索可能なら活用）、**移行手順 issue** を起票。
  実装はせず「人間 or 案2への引き継ぎ」を提案。

**ポイント:** 「自動で当てて良い更新（パッチ/マイナー）」と「設計判断が要る更新（メジャー）」を
LLM で分離。前者は Codex に任せ、後者は Claude に調査・起票だけさせ、人間の判断を残す。

```yaml
name: nightly-deps-update-codex
description: 安全な依存更新 + テスト検証
enabled: true
schedule:
  cron: "0 3 * * 2-6" # 火〜土の 3:00（月曜の朝に大量 PR を避ける運用も可）
working_directory: /Users/you/projects/your-repo
prompt: |
  ロックファイルを更新（パッチ/マイナーのみ。メジャーは除外）。
  ビルドとテストを実行し、全てグリーンの時だけ deps/nightly-<date> ブランチで
  ドラフト PR を作成。更新したパッケージ一覧と diff の要点を PR 本文に記載。
  テストが落ちたら PR を作らず、落ちた更新を切り分けて報告。
provider: codex
claude_args: ["--full-auto"]
timeout_seconds: 1800
```

---

## 案5: PR レビュー bot（夜間消化）

**目的:** レビュー待ち PR の滞留を解消。朝、各 PR に「観点付きの一次レビュー」が
付いている状態にする。

**LLM 配置（2段・大規模差分対策）:**

- **1:00 / Gemini** — 大きな差分の PR（数千行）を大規模コンテキストで要約し、
  「変更の意図 / リスク箇所 / レビュー観点」を PR にコメント。人間とClaudeの下読みを軽くする。
- **1:40 / Claude** — 全 open PR を対象に、設計・バグ・セキュリティ・テスト網羅性の観点で
  レビューコメントを投稿。`gh pr review --comment`（**approve はさせない**）。

```yaml
name: nightly-pr-review-claude
description: open PR の一次レビュー（Claude）
enabled: true
schedule:
  cron: "40 1 * * *"
working_directory: /Users/you/projects/your-repo
prompt: |
  `gh pr list --state open --json number,title,isDraft` のうち draft でない PR を対象に、
  各 PR の差分(`gh pr diff <n>`)をレビュー。観点: 正しさ / 設計 / セキュリティ /
  テスト網羅 / 後方互換。指摘は `gh pr review <n> --comment -b "..."` で投稿。
  approve / request-changes はしない（一次レビューに留める）。
  指摘ゼロなら "LGTM (automated first pass)" を1行コメント。
provider: claude
claude_args: ["-p", "--allowedTools", "Read,Grep,Glob,Bash(gh:*),Bash(git:*)"]
timeout_seconds: 1200
```

**注意:** 自動 **approve は厳禁**（マージ責任は人間）。コメントには
"automated first pass" と明記し、人間レビューと区別できるようにする。

---

## 案6: 技術的負債の棚卸し & Issue 自動起票

**目的:** 散在する TODO / FIXME / コードスメル / 古い API 利用を週次で棚卸しし、
バックログ（GitHub Projects）に積む。

**LLM 配置（1段）:**

- **日曜 4:00 / Claude** — コードベースを走査し、`TODO`/`FIXME`、重複コード、
  巨大関数、未テスト領域などを抽出。**既存 issue と重複しないものだけ**を
  `tech-debt` ラベル付きで起票し、Projects の Backlog に追加。

```yaml
name: weekly-tech-debt-audit
description: 技術的負債の棚卸しと issue 起票（週次）
enabled: true
schedule:
  cron: "0 4 * * 0" # 毎週日曜 4:00
working_directory: /Users/you/projects/your-repo
prompt: |
  コードベースを走査して技術的負債を最大5件抽出（TODO/FIXME, 重複, 巨大関数,
  未テスト, 非推奨 API など）。各候補について:
    - `gh issue list --label tech-debt --search "<keyword>"` で重複を確認
    - 重複がなければ「現状 / 影響 / 提案する対応」を本文に gh issue create
    - tech-debt ラベルを付け Projects の Backlog に追加
  1回の実行で5件まで。粒度は「1 issue = 1まとまりの作業」。
provider: claude
claude_args: ["-p", "--allowedTools", "Read,Grep,Glob,Bash(gh:*)"]
timeout_seconds: 1200
```

**注意:** 件数上限（例: 5件）を必ず設け、issue スパムを防ぐ。重複チェックを
プロンプトに明記する。

---

## 案7: ドキュメント同期 & 整合性チェック

**目的:** コードは変わったのに README/docs が古いまま、というズレを夜間に検出・修正。

**LLM 配置（2段）:**

- **2:00 / Gemini** — 直近の差分（`git log`/`git diff`）と docs を突き合わせ、
  「実装と乖離した記述」「未記載の新機能」を一覧化。大量ファイルの突合に大規模コンテキストが効く。
- **2:40 / Claude** — Gemini の検出結果のうち確度の高いものを実際に docs へ反映し、
  `docs/sync-<date>` ブランチでドラフト PR を作成。曖昧なものは issue 化。

```yaml
name: nightly-docs-sync-claude
description: 実装とドキュメントの乖離を修正（Claude）
enabled: true
schedule:
  cron: "40 2 * * *"
working_directory: /Users/you/projects/your-repo
prompt: |
  直近7日の変更(`git log --since="7 days ago"`)と README/docs を突き合わせ、
  乖離を修正。明確なもの(コマンド名・引数・パスの変化など)は docs を編集し、
  docs/sync-<date> ブランチでドラフト PR を作成。
  仕様の意図が不明なものは編集せず "docs drift" ラベルで issue 化。
provider: claude
claude_args: ["-p", "--allowedTools", "Read,Grep,Glob,Edit,Bash(git:*),Bash(gh:*)"]
timeout_seconds: 1200
```

---

## 案8: 技術リサーチ・ダイジェスト配信

**目的:** 使用ライブラリの新バージョン、CVE、競合動向、関連ベストプラクティスを
毎朝ダイジェストで受け取る。コードは触らない「インテリジェンス」系。

**LLM 配置（2段・Web リサーチ）:**

- **5:00 / Gemini** — 依存ライブラリ・技術領域について Web リサーチし、
  生の調査メモを出力（Web アクセス可能な構成が前提。MCP の Web 検索や `gh`、`curl` 等）。
- **5:30 / Claude** — Gemini の調査メモを、自プロジェクトへの影響度で取捨選択・構造化し、
  「今朝のダイジェスト」issue を起票（`digest` ラベル）。アクションが要るものは別 issue を提案。

```yaml
name: morning-research-digest-claude
description: リサーチ結果を自プロジェクト向けダイジェストに整形
enabled: true
schedule:
  cron: "30 5 * * 1-5" # 平日 5:30
working_directory: /Users/you/projects/your-repo
prompt: |
  本リポジトリの依存(package.json 等)と技術スタックを踏まえ、
  直近の重要アップデート/CVE/ベストプラクティス変化を調査・要約し、
  「YYYY-MM-DD 技術ダイジェスト」を gh issue create（digest ラベル）。
  各項目に「自プロジェクトへの影響度: 高/中/低」と推奨アクションを付ける。
  対応が要る項目は follow-up issue を提案（起票はせず本文に列挙）。
provider: claude
claude_args: ["-p", "--allowedTools", "Read,Bash(gh:*),WebSearch,WebFetch"]
timeout_seconds: 1200
```

**注意:** ネットワークアクセスはこのスケジューラの実行環境（あなたの Mac）と
各 CLI の設定に依存。Web 検索可否は各プロバイダの構成に合わせて調整する。

---

## 案9: Projects ボード健全性レポート & 朝の計画

**目的:** GitHub Projects のボードを「健康診断」し、停滞・WIP過多・期限超過を可視化。
さらに今日やるべきトップ3を提案。[`daily-review.yaml`](../jobs/examples/daily-review.yaml) の
GitHub Projects 連携版。

**LLM 配置（1段）:**

- **平日 7:00 / Claude** — Projects の各カラムを読み、(a) N日以上動いていない issue、
  (b) In Progress が多すぎる兆候、(c) 期限/マイルストーン超過、(d) 担当不在 を検出。
  レポートを `daily-standup` issue にコメントし、今日の重点タスク3つを提案。

```yaml
name: morning-board-health-claude
description: Projects ボード健全性レポート + 今日の計画
enabled: true
schedule:
  cron: "0 7 * * 1-5" # 平日 7:00（起床に合わせる）
working_directory: /Users/you/projects/your-repo
prompt: |
  `gh project item-list <number> --owner <owner>` 等で Projects ボードを取得し:
    - 3日以上 Status が変わっていない In Progress
    - WIP 過多（In Progress が N 件超）
    - 期限/マイルストーン超過、担当者不在の高優先度 issue
  を検出してレポート化。最後に「今日の重点タスク Top3」を根拠付きで提案し、
  daily-standup issue（無ければ作成）にコメント。
provider: claude
claude_args: ["-p", "--allowedTools", "Read,Bash(gh:*)"]
timeout_seconds: 900
```

**注意:** `gh project` は GitHub CLI の Projects (v2) 拡張に依存。
`gh extension install` 済みであること、`project` スコープのトークンであることを確認。

---

## 案10: マルチ LLM クロスチェック監査

**目的:** 重要な品質ゲート（セキュリティ・正しさ）を**複数 LLM の独立判断**で担保する。
1つの LLM の見落としを、別 LLM が拾う「多数決 / 差分検出」型の監査。

**LLM 配置（3段・独立実行 → 統合）:**

- **1:00 / Claude** — 直近マージ分または対象 PR をセキュリティ観点でレビューし、
  所見を `.nightly/audit-claude.md`（または gist）に出力。
- **1:00 / Codex** — 同じ対象を、実際にコードを動かしながら（依存の脆弱性スキャン、
  危険な関数呼び出しの実行確認など）監査し、`.nightly/audit-codex.md` に出力。
- **2:00 / Gemini** — 2つの監査結果を**突き合わせ**、(a) 両者一致の重大所見、
  (b) 片方だけが指摘した所見（要人間確認）を整理し、`security-audit` issue を起票。

**統合ジョブ例（Gemini）:**

```yaml
name: nightly-crosscheck-merge-gemini
description: 複数 LLM のセキュリティ監査結果を突き合わせて起票
enabled: true
schedule:
  cron: "0 2 * * *" # Claude/Codex の監査(1:00)の後
working_directory: /Users/you/projects/your-repo
prompt: |
  .nightly/audit-claude.md と .nightly/audit-codex.md を読み比べ:
    - 両 LLM が一致して指摘した所見（= 確度高、最優先）
    - 片方のみが指摘した所見（= 要人間確認）
    - 互いに矛盾する判断
  を表に整理し、重大なものがあれば security-audit ラベルで issue 起票。
  所見ゼロなら起票せず "no findings" とだけログ出力。
provider: gemini
claude_args: ["--approval-mode", "auto_edit", "-p"]
timeout_seconds: 900
```

**ポイント:** これがマルチ LLM の真骨頂。**同じ問いを独立に解かせ、答えを照合する**ことで、
単一モデルのバイアスや見落としに対する冗長性が生まれる。一致した指摘は信頼でき、
食い違いは「人間が見るべき箇所」として浮かび上がる。

---

## 運用のコツ・安全策

### 段階的に導入する

1. **観察のみ（Week 1）** — まずは plan モードや read-only で「提案・コメント」だけ。
   issue 化やレビューコメントは出すが、コードは変えない。挙動を観察する。
2. **ドラフト止まり（Week 2-3）** — 自動修正系を draft PR まで許可。main には触らせない。
3. **限定自動化（Week 4-）** — 信頼できたワークフローだけ、対象を絞って自動化を広げる。

### 必ず守るガードレール

- **main への直接 push 禁止** — 変更は必ずブランチ + draft PR 経由。
- **自動マージ・自動 approve 禁止** — マージ判断は人間が握る。
- **件数上限** — issue 起票・PR 作成は1回の実行でN件までに制限（スパム防止）。
- **`timeout_seconds` 必須** — 暴走・ハングの保険。`brew install coreutils` で `gtimeout` 有効化。
- **権限は最小から** — `--allowedTools` を絞り、`--dangerously-skip-permissions` /
  `--yolo` / `--dangerously-bypass-approvals-and-sandbox` は信頼できるジョブにのみ。

### コストとレート

- 深夜帯にまとめることで API スパイクと人的割り込みを避けられる。
- 一次処理（大量・浅い）は **Gemini**、深い判断は **Claude**、手を動かすのは **Codex**、と
  振り分けるとコスト効率が良い。
- ヘルスゲート（`SERVICE_HEALTH_URL`）が効いていれば、サービス停止中はジョブが
  自動スキップされる（README の Configuration 参照）。

### 朝のレビュー動線

- 一晩の成果は **GitHub 上に集約**（issue / draft PR / ラベル / Projects）されるので、
  朝はまず GitHub の通知と `digest` / `daily-standup` issue を見るだけで全体像が掴める。
- ジョブ単位の詳細は `logs/<job>/YYYY-MM-DD.log`（web UI のログビューア）で追える。

---

## 組み合わせの全体像（一晩のタイムライン例）

```
01:00  案1 Gemini（issue 一次トリアージ）   案5 Gemini（大PR要約）   案10 Claude/Codex（独立監査）
01:30  案1 Claude（難判定 issue 深掘り）
01:40  案5 Claude（PR 一次レビュー）
02:00  案2 Claude（実装プラン）  案3 Codex（テスト修正）  案7 Gemini（docs 乖離検出）  案10 Gemini（監査統合）
02:30  案2 Codex（実装→draft PR）
02:40  案7 Claude（docs 修正 PR）
03:00  案2 Claude（生成PR自己レビュー）  案4 Codex（依存更新）
03:40  案4 Claude（メジャー更新の移行 issue）
04:00  案6 Claude（週次・技術的負債棚卸し / 日曜のみ）
05:00  案8 Gemini（技術リサーチ）
05:30  案8 Claude（ダイジェスト整形・起票）
07:00  案9 Claude（ボード健全性 + 今日の計画）← 起床に合わせる
```

すべてを一度に有効化する必要はありません。まずは **案1・案5・案9**（観察・提案系）から始め、
信頼が育ったら **案2・案3・案4**（手を動かす系）へ広げるのが安全です。
