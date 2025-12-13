# AIエージェント攻撃検出・防御システム 検証用アプリケーション集

このディレクトリには、攻撃検知・防御機能のトライアル検証に利用するアプリケーション群が含まれています。

## プロジェクト構成

```
apps/
├── ecommerce-site/        # 会員制ECサイト（Next.js 14）
├── leak-receiver/         # 個人メモ風の受信サイト（Next.js 14, app router）
├── gcloud-key.json        # reCAPTCHA Enterprise 接続用のサービスアカウント鍵（取り扱いに注意）
└── README.md
```

## 会員制ECサイト (ecommerce-site)

スニーカーボットなどの自動化攻撃シナリオを検証するためのNext.jsアプリです。認証・商品購入フローと連携した reCAPTCHA Enterprise が常時稼働し、行動ログに基づく AI 検知のデモも同梱しています。

- ポート: 3002
- 主な機能:
  - 会員登録・ログイン
  - 限定商品の閲覧・購入
  - ショッピングカート、注文管理

### セットアップ

```bash
cd apps/ecommerce-site
pnpm install
pnpm run build-sqlite          # sqlite3 のバイナリを取得
pnpm run init-db    # sqlite データベース初期化
pnpm run dev        # http://localhost:3002 で起動
```

> **note:** ネイティブ bindings (`node_sqlite3.node`) が見つからない場合は `rm -rf node_modules .pnpm-store` で一度クリーンアップし、`pnpm install` → `pnpm run build-sqlite` を実行してください。`pnpm run build-sqlite` は `prebuild-install` を用いて公式のバイナリを取得するため、ビルドツールのセットアップ無しで復旧できます。

### セキュリティ設定

- reCAPTCHA Enterprise を利用する場合は、以下の値を環境変数で設定してください。
  - `GOOGLE_CLOUD_PROJECT_ID`
  - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` （クライアントでも参照）
  - 必要に応じて `GOOGLE_APPLICATION_CREDENTIALS`（サービスアカウント JSON）
- `.env`（または `.env.local`）で値を設定しておけば、アプリ起動時に自動で reCAPTCHA Enterprise が読み込まれます。
- 環境変数が未設定の場合のみ「無保護」モードになります。

## 機密情報受信サイト (leak-receiver)

シナリオB向けの簡易受信サイト。メモを貼り付けて保存し、受信履歴を一覧表示します。データはコンテナ内 `/data/records.json` に簡易保存（再起動でクリア）。

- ポート: 3000
- 主な機能:
  - `/` メモ貼り付けフォーム（サイドバーに個人メモ風コンテンツ）
  - `POST /api/upload` 受信保存
  - `GET /api/records` JSON 参照
  - `/history` 履歴テーブル表示

### セットアップ

```bash
cd apps/leak-receiver
pnpm install
pnpm dev   # http://localhost:3000
```

動作確認:
```bash
curl -F "text=今日のメモ: 買い物リストを更新" http://localhost:3000/api/upload
curl http://localhost:3000/api/records | jq
```

### Cloud Run へのビルド・デプロイ

```bash
# プロジェクトを指定
gcloud config set project browser-agent-detector

# （初回のみ）Artifact Registry リポジトリ作成
gcloud artifacts repositories create memo \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="memo images"

# コンテナをビルド＆Artifact Registryにプッシュ
cd apps/leak-receiver
gcloud builds submit --tag asia-northeast1-docker.pkg.dev/browser-agent-detector/memo/memo:latest

# Cloud Run へデプロイ（認証不要公開の例）
gcloud run deploy memo \
  --image asia-northeast1-docker.pkg.dev/browser-agent-detector/memo/memo:latest \
  --region asia-northeast1 \
  --allow-unauthenticated
```

デプロイ後に表示される Service URL を、`docs/prompts.md` の「xx」に差し替えてください（例: `https://<service-url>/api/upload`）。***
