# claude-schedule-management

> **macOS 専用。** [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) のプロンプトを `launchd` で定期実行するためのローカル web サービス。
>
> 🇺🇸 [English README](README.md)

スケジュール済みの Claude プロンプトをブラウザのタブひとつで管理。YAML が source of truth で、web UI はそれを編集するだけ。

## スクリーンショット

| ジョブ一覧                                       | 作成・編集フォーム                               | ログビューア                                      |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------- |
| ![ジョブ一覧](docs/screenshots/01-jobs-list.png) | ![編集フォーム](docs/screenshots/02-job-new.png) | ![ログビューア](docs/screenshots/03-job-logs.png) |

```
┌─ web UI (React) ──── HTTP ──── Hono API ─────┐
│   /jobs                        ├─ jobs/*.yaml  (source of truth)
│   /jobs/:name                  ├─ plists/*    (generated)
│   /jobs/:name/logs             └─ logs/*      (per-job append)
└──────────────────────────────────────────────┘
        ▲
        │ launchctl bootstrap / bootout / kickstart
        ▼
   ~/Library/LaunchAgents/local.claude-schedule.job.*.plist
        │
        ▼ scheduled time
   bin/runner.sh <job-name>  →  claude -p "<prompt>"
                             →  logs/<job>/YYYY-MM-DD.log
```

## 機能

- ジョブの一覧・作成・編集・削除をブラウザから
- 5 フィールドの cron 式とプリセット（1時間毎、毎日 9:00、平日 9:00 など）
- macOS ネイティブのフォルダピッカーで `working_directory` を選択
- 「今すぐ実行」ボタン（内部で `launchctl kickstart`）
- 日付別ログファイルと自動更新ビューア
- 孤立ジョブの検出（YAML が無いのに launchd に登録されているもの）
- 英語 / 日本語 UI （i18n）
- すべてローカル、テレメトリなし、`127.0.0.1` のみ bind

## 前提

- macOS（現状サポートしているスケジューラは launchd のみ。[ROADMAP.md](ROADMAP.md) 参照）
- Node 20+
- [`yq`](https://github.com/mikefarah/yq) — `brew install yq`
- [`claude` CLI](https://docs.anthropic.com/claude/docs/claude-code)

依存チェック:

```bash
bin/doctor.sh
```

## インストール

```bash
git clone https://github.com/t2421/claude-schedule-management.git
cd claude-schedule-management
npm install
npm run build
bin/install-service.sh
open http://127.0.0.1:7878
```

`install-service.sh` は `~/Library/LaunchAgents/local.claude-schedule.service.plist`
を生成し `launchctl` で起動します。ログイン時に自動起動します。

アンインストール:

```bash
bin/uninstall-service.sh
```

## 開発

```bash
npm run dev
# → API: http://127.0.0.1:7878
# → web (Vite, HMR): http://localhost:5173  (/api は 7878 にプロキシ)
```

すでに常駐サービスを動かしていて UI だけ HMR で動かしたい場合:

```bash
npm --workspace web run dev
```

### テスト

```bash
npm test
```

## 仕組み

1. `jobs/<name>.yaml` が source of truth
2. UI から保存すると YAML を書き、`plists/local.claude-schedule.job.<name>.plist` を生成し、`~/Library/LaunchAgents/` にシンボリックリンクして `launchctl bootstrap`
3. 時刻が来ると launchd が `bin/runner.sh <name>` を起動
4. runner は `yq` で YAML を読んで `cd working_directory` し、`claude -p "<prompt>"` を実行
5. stdout / stderr / exit code を `logs/<name>/YYYY-MM-DD.log` に追記

## ジョブ YAML

```yaml
name: daily-review
description: 毎朝のレビュー
enabled: true
schedule:
  cron: "0 9 * * *" # 分 時 日 月 曜
working_directory: /Users/you/projects/foo
prompt: |
  昨日の進捗を確認して、本日のタスクを提案してください。
claude_args: ["-p"]
env:
  EXTRA: value
timeout_seconds: 600
```

他の例は [`jobs/examples/`](jobs/examples) を参照。

### スケジュールジョブの permission 戦略

スケジュール実行は TTY が無いため、プロンプトがツール許可を要求するとジョブは
失敗するかハングします。次のどれかを `claude_args` に組み込んでください:

| 戦略                  | `claude_args`                                                                    | リスク | 用途                           |
| --------------------- | -------------------------------------------------------------------------------- | ------ | ------------------------------ |
| Plan のみ（最も安全） | `["-p", "--permission-mode", "plan"]`                                            | 最低   | 読み取り専用のレビュー / 提案  |
| 限定 allowlist        | `["-p", "--allowedTools", "Read,Grep,Glob"]`                                     | 低     | レポを覗くだけのジョブ         |
| 許可スキップ          | `["-p", "--dangerously-skip-permissions"]`                                       | 高     | フル権限が必要な信頼済み自動化 |
| プロジェクト設定      | `["-p"]` + 作業ディレクトリ配下の `.claude/settings.json` に `permissions.allow` | 中     | プロジェクト単位で細かく制御   |

UI の `claude_args` フィールド横にプリセットを用意してあります。  
必ず `timeout_seconds` を安全網として設定し、`brew install coreutils` を入れて
runner が `gtimeout` で殺せるようにしておくのを推奨。

### サポートしている cron 構文

5 フィールド (`分 時 日 月 曜`):

| 書き方  | 意味                  |
| ------- | --------------------- |
| `*`     | wildcard              |
| `N`     | ぴったり              |
| `A,B,C` | リスト                |
| `A-B`   | 範囲                  |
| `*/N`   | ステップ（例 `*/15`） |

内部で launchd の `StartCalendarInterval` 配列に変換されます。

## 設定

`~/Library/LaunchAgents/local.claude-schedule.service.plist` の環境変数で変更可能（開発時はシェルの環境変数）:

| 変数                            | デフォルト                      | 説明                           |
| ------------------------------- | ------------------------------- | ------------------------------ |
| `PORT`                          | `7878`                          | API ポート                     |
| `HOST`                          | `127.0.0.1`                     | bind アドレス                  |
| `CLAUDE_SCHEDULE_LABEL_PREFIX`  | `local.claude-schedule.job`     | ジョブ用 launchd ラベル prefix |
| `CLAUDE_SCHEDULE_SERVICE_LABEL` | `local.claude-schedule.service` | サービス自身の launchd ラベル  |

## ディレクトリ

```
claude-schedule-management/
├── server/      Hono API (TypeScript)
├── web/         React UI (Vite + TypeScript, i18n)
├── bin/
│   ├── runner.sh             launchd が呼ぶ実行スクリプト
│   ├── doctor.sh             依存チェック
│   ├── install-service.sh    web サービスを launchctl に常駐
│   └── uninstall-service.sh
├── jobs/                YAML manifest (source of truth)
│   └── examples/        サンプルジョブ
├── plists/              生成 plist (gitignore)
└── logs/                実行ログ (gitignore)
```

## セキュリティ

[SECURITY.md](SECURITY.md) を参照。要約: 認証なしで localhost のみ bind。シングルユーザーの開発機なら問題ないが、共有ホストには載せないこと。

## 貢献

[CONTRIBUTING.md](CONTRIBUTING.md) を参照。

## ライセンス

[MIT](LICENSE) © claude-schedule-management contributors
