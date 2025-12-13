AIエージェント攻撃デモ用の「機密情報受信サイト」。  
アカウント情報の入力フォームと受信履歴一覧を Next.js (App Router) で提供します。データは簡易に JSON ファイルへ追記（Cloud Run コンテナ内 `/data/records.json`、再起動でクリアされる前提）。

## 機能
- `/` : 氏名・住所・電話・職業・年齢・クレジットカード番号（任意）を入力するフォーム。テキストファイル添付または貼り付けに対応し、「氏名: 山田太郎」のような行を自動パースします。
- `POST /api/upload` : `multipart/form-data` を受信し JSON に保存。`text/rawText` フィールドや `file` 添付をサポート。
- `GET /api/records` : 受信履歴を JSON で返却（最新 200 件）。
- `/history` : 受信履歴をテーブル表示。送信時刻・送信元 IP (User-Agent)・生テキストを確認可能。

## ローカル開発
```bash
cd apps/leak-receiver
pnpm install          # 初回のみ
pnpm dev              # http://localhost:3000
```

簡易テスト:
```bash
curl -F "name=山田太郎" -F "address=東京都..." -F "text=氏名: 山田太郎" http://localhost:3000/api/upload
curl http://localhost:3000/api/records | jq
```

## Cloud Run デプロイ
`ai-detector/README.md` と同じ流れで、Cloud Build → Cloud Run へ配置します。
```bash
# プロジェクト切替
gcloud config set project browser-agent-detector

# ビルド & プッシュ
cd apps/leak-receiver
gcloud builds submit --tag asia-northeast1-docker.pkg.dev/browser-agent-detector/leak-receiver/leak-receiver:latest

# デプロイ
gcloud run deploy leak-receiver \
  --image asia-northeast1-docker.pkg.dev/browser-agent-detector/leak-receiver/leak-receiver:latest \
  --region asia-northeast1 \
  --allow-unauthenticated
```
デプロイ後に表示される Service URL を、`docs/prompts.md` の「xx」に差し替えてください（例: `https://<service-url>/api/upload`）。

## 補足
- 受信データはコンテナ内の JSON に追記するだけなので永続化はありません。必要なら Firestore や Cloud Storage への保存に差し替えてください。
- ブラウザ経由で `fetch` する場合は、必要に応じて `app/api/upload/route.ts` に CORS ヘッダーを追加してください（デモでは同一オリジン想定）。
