# AIエージェント攻撃検出・防御システム

- [背景と課題](#背景と課題)
- [提案する解決策](#提案する解決策)
- [システム概要](#システム概要)
- [主な機能](#主な機能)
- [アーキテクチャ](#アーキテクチャ)
- [クイックスタート](#クイックスタート)
- [デモシナリオ](#デモシナリオ)
- [ドキュメント](#ドキュメント)

## 背景と課題

AI エージェントによるブラウザ自動操作は、プロンプトインジェクションによって乗っ取られるリスクがあります。攻撃者はメールやウェブページに埋め込んだ命令を介してエージェントを制御し、ギフト券の横領や機密情報送信などの不正操作を「正規ユーザー権限で」実行できます。  
生成 AI は環境情報とユーザー指示が混在した入力を前提としており、インジェクション自体を完全に防ぐことは原理上困難です。人間的な操作を模倣するため従来型の Bot 対策も突破されやすく、金銭・個人情報を扱うサービスでは深刻な影響が想定されます。

## 提案する解決策

本システムは「ユーザー固有のペルソナからの逸脱」を検知軸とし、AI エージェントが模倣しづらい行動・履歴特性を評価します。  
ブラウザ操作ログ、端末指紋、購入履歴、利用時間帯などを組み合わせてペルソナモデルを構築し、異常な振る舞いをリアルタイムにスコアリングします。AI の進化に依存しない行動ペルソナベースの防御を提供し、乗っ取り前提のゼロトラスト型対策を実現します。

## システム概要

- **AI 検知 API (`ai-detector/`)**: FastAPI + LightGBM + KMeans/IsolationForest による推論サービス。`POST /detect` と `POST /detect_cluster_anomaly` を提供し、`docs/API-doc.md` に仕様を掲載しています。
- **検証用 EC サイト (`apps/ecommerce-site/`)**: Next.js 14 + SQLite の会員制サイト。`BehaviorTrackerProvider` がブラウザ操作を収集し、reCAPTCHA Enterprise と AI スコアバッジを統合します。
- **共通ドキュメント**: 技術要件やデータモデルは `docs/` 配下（`requirements.md`, `data-model.md`, `browser-detection-data.md`）にまとめています。

## 主な機能

1. **多層検知**: 行動ログによるヒューリスティック判定、クラスタ異常検知、reCAPTCHA Enterprise を段階的に適用。
2. **ペルソナ逸脱検知**: `BehaviorTracker` の統計量と会員プロフィールから LightGBM 特徴量を生成し、`detect_cluster_anomaly` でクラスタ異常を判定。
3. **リアルタイム可視化**: 左下バッジに reCAPTCHA / AI Detector / クラスタリングスコア・閾値・更新時刻を表示。
4. **セキュリティログ**: `apps/ecommerce-site/logs/security.log` と `SQLite security_logs` に `session_id`, `bot_score`, `action_taken` などを保存。
5. **トレーニングログ**: 環境変数 `AI_DETECTOR_TRAINING_LOG=1` で FastAPI が JSONL 形式の行動サンプルを蓄積。

詳細は `docs/requirements.md` と各プロジェクトフォルダの README を参照してください。

## アーキテクチャ

```
ブラウザ (BehaviorTracker)
   ├─ 5秒ごと: /api/security/aidetector/detect → ヒューリスティック bot スコア
   ├─ reCAPTCHA Enterprise → /api/security/recaptcha/verify
   └─ カート購入時: /api/purchase/check
          └─ detectPurchaseAnomaly → http://localhost:8000/detect_cluster_anomaly
                           └─ ai-detector (LightGBM + KMeans/IsolationForest)
```

`docs/requirements.md` の「システムアーキテクチャ」節では、行動計測から購入遮断までの詳細フローを説明しています。

## クイックスタート

### FastAPI 検知 API
```bash
cd ai-detector
uv sync
./scripts/run_server.sh --reload
```
- 追加依存: `uv sync --group train`（学習系）、`uv sync --group vector --extra cpu`（ベクトル化ツール）
- テスト: `uv run pytest`
- モデル再生成: `uv run python training/cluster/create_models.py`
- 学習用ログを残したい場合は `./scripts/run_server_with_logs.sh --reload` で `AI_DETECTOR_TRAINING_LOG=1` を自動セットできます。スクリプトを使わず Python で直接起動する場合は、下記のように環境変数を付与して `uvicorn` を実行してください。

```bash
cd ai-detector
uv sync
AI_DETECTOR_DISABLE_BROWSER_MODEL=1 \
AI_DETECTOR_LOG_LABEL=human \
AI_DETECTOR_TRAINING_LOG=1 \
AI_DETECTOR_TRAINING_LOG_PATH=./training/browser/data \
./.venv/bin/python -m uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload
```
- LightGBM モデルを配置していない状態で API だけ起動したい場合は `AI_DETECTOR_DISABLE_BROWSER_MODEL=1` を付与します（このモードでは `POST /detect` へアクセスすると `503 Service Unavailable` が返ります）。`AI_DETECTOR_LOG_LABEL=human|bot` を設定すると、同じ日付でもサブディレクトリを分けて学習用ログを保存できます。

### Next.js 検証サイト
```bash
cd apps/ecommerce-site
pnpm install
pnpm run build-sqlite
pnpm run init-db
pnpm run dev -p 3002
```
- reCAPTCHA/Google Cloud 設定は `.env.local` や `gcloud-key.json` を参照
- セキュリティ API: `/api/security/aidetector/*`, `/api/security/recaptcha/verify`

手順や構成ファイルの詳細は各サブディレクトリの README/ドキュメントを確認してください。

### LightGBM ブラウザモデルの再学習
- `ai-detector/training/browser/train_lightgbm.py` で `training/browser/data/{human,bot}` 以下の JSON/JSONL を自動的に読み込み、人と AI の行動データから LightGBM モデルを学習できます。
- glob パターン (`--human-glob`, `--bot-glob`) によりファイル追加へ柔軟に対応し、セッション単位でリークを防ぎつつ検証データを分割します。
- 実行例:
  ```bash
  cd ai-detector
  uv sync --group train
  uv run python training/browser/train_lightgbm.py \
    --human-glob "training/browser/data/human/*.jsonl" \
    --bot-glob "training/browser/data/bot/*.jsonl" \
    --auto-scale-pos-weight \
    --valid-ratio 0.2
  ```
- 正則化・木構造のハイパーパラメータ（`--learning-rate`, `--num-leaves`, `--max-depth`, `--lambda-l1`, `--lambda-l2`, `--feature-fraction`, `--bagging-fraction` など）はコマンドライン引数で調整できます。
- 結果は `ai-detector/training/browser/model/<timestamp>/` に `lightgbm_model.txt` と `training_summary.json` (引数・指標・特徴量重要度) を保存し、推論用の正式モデルは `ai-detector/models/browser/lightgbm_model.txt` へ配置します。

## デモシナリオ

評価環境では以下の攻撃シナリオを再現し、検知精度・誤検知率・見逃し率を測定します。

1. **ギフト券不正送付**: プロンプトインジェクションで乗っ取ったエージェントがギフト券を第三者へ送付。
2. **マネーロンダリング商品購入**: 正規取引に見せかけつつ高額商品を複数回購入。
3. **機密情報送信**: 乗っ取ったエージェントが会員情報を外部へ送信。

これらのシナリオは `apps/ecommerce-site` の UI と `ai-detector` の API を組み合わせて再現できます。評価手法の詳細は `docs/requirements.md` を参照してください。

## ドキュメント

- `docs/requirements.md` — 要件とリスク、対策技術の評価、新規性/将来性
- `docs/data-model.md` — FastAPI・Next.js・SQLite・ログ構造
- `docs/browser-detection-data.md` — 行動データフォーマット
- `docs/API-doc.md` — `POST /detect`・`POST /detect_cluster_anomaly` などの API 仕様
- 各プロジェクト直下の README/コードコメントも適宜参照してください。

## ライセンス

MIT License
