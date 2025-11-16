# AIエージェント攻撃検出・防御システム 要件 (2025-05 更新)

## 1. プロジェクト概要
- **目的**: ブラウザ行動ログと会員ペルソナ属性を統合し、AI エージェントによる自動購入や悪用操作をリアルタイムに検出して可視化する。
- **構成物**:
  1. `ai-detector/` ─ FastAPI + LightGBM + KMeans/IsolationForest による検知 API。`uv` を利用して Python 依存を管理し、`POST /detect` / `POST /detect_cluster_anomaly` を提供する。
  2. `apps/ecommerce-site/` ─ Next.js 14 + SQLite の検証用 EC サイト。`BehaviorTrackerProvider` がブラウザ操作を収集し、reCAPTCHA Enterprise と AI スコアのオーバーレイ UI を表示する。
- **主な検知ポイント**: マウス/キーボード/スクロール挙動、ナビゲーションのリズム、ブラウザ指紋、会員プロフィールと購買内容の乖離、OTP/チャレンジ突破状況。

## 2. システムアーキテクチャ

### 2.1 行動計測〜可視化
```
[BehaviorTrackerProvider] ─> [browser-agent-sdk/packages/agent-core]
      ├─(5 秒ごと JSON)─> /api/security/aidetector/detect  ──┐
      └─(localStorage 経由)─> ScoreDisplayScript <────────────┘
                                              │
                                   AIDetectorProvider (0.5s/2s/5s チェック)
                                   RecaptchaProvider + reCAPTCHA Enterprise
```
- `BehaviorTracker` は 2 秒キャッシュ + 5 秒間隔で最新の `behavioral_data` と `recent_actions` を Next.js API に送信し、ローカルのヒューリスティックボットスコアを計算する。
- スコアは `window.createScoreDisplay` によりブラウザ左下のバッジへ表示され、`localStorage` に `recaptchaScore` / `aiDetectorScore` / `clusteringScore` 等を保存する。
- `RecaptchaProvider` は Site Key が設定されているときのみ Enterprise スクリプトを読み込み、`/api/security/recaptcha/verify` で Google Cloud Assessment を作成する。

### 2.2 購入フロー検知
```
cart page -> /api/purchase/check
    ├─ SECURITY_SUITE_LABEL (`apps/ecommerce-site/app/lib/security.ts`) で reCAPTCHA + AI Detector を常時オンにしたまま処理
    ├─ detectPurchaseAnomaly(...) -> http://localhost:8000/detect_cluster_anomaly
    ├─ logSecurityEvent(...) -> SQLite security_logs + logs/security.log
    └─ on anomaly -> OTP 再認証フローと ScoreDisplay update
```
- `detectPurchaseAnomaly` (`apps/ecommerce-site/app/lib/purchase-detection.ts`) はカート集計からクラスタ判定用ペイロードを組み立て、FastAPI のクラスタ API を呼び出す。
- `app/api/purchase/check` は 403 応答時に OTP 検証モードへ切り替え、再認証の案内を行う。

## 3. 主要ユースケース
1. **限定販売の保護**: 深夜にランク不相応な大量注文が走った際、`/detect_cluster_anomaly` の結果でワークフローを自動停止し OTP を必須にする。
2. **多層スコアの可視化**: reCAPTCHA Enterprise、ヒューリスティック AI 判定、クラスタスコアを同一バッジで比較し、調査ログ (`logs/security.log` + `security_logs` テーブル) と突合する。
3. **行動ログ収集**: `AI_DETECTOR_TRAINING_LOG=1` で FastAPI 側が受信ペイロードと推論結果を JSONL へ蓄積し、後続の LightGBM/クラスタ再学習に利用する。

## 4. 機能要件

### 4.1 ブラウザ行動収集 (`browser-agent-sdk/packages/agent-core`)
- `BehaviorTrackerProvider` がクライアントマウント時に初期化し、マウス (最大 1,000 件) / クリック (100 件) / キー入力 (500 件) / スクロール (100 件) をリングバッファへ保持する。
- 5 秒ごと & `beforeunload` で `/api/security/aidetector/detect` へ `behavioral_data`・`recent_actions` (最新 6 件)・`deviceFingerprint`・`contextData` を送信する。
- `contextData` には `actionType`, `url`, `page_load_time`, `first_interaction_time`, `first_interaction_delay` が含まれ、`docs/browser-detection-data.md` の仕様を満たす。
- `BehaviorTracker` が取得したスコアは `localStorage` とバッジへ反映され、EC サイト各ページで再利用される。

### 4.2 ブラウザヒューリスティック検知 (`app/api/security/aidetector/detect`)
- `SECURITY_SUITE_LABEL` (`apps/ecommerce-site/app/lib/security.ts`) は常に `'recaptcha+ai-detector'` を指し、reCAPTCHA Enterprise と FastAPI AI Detector の双方を同時に呼び出す。`getAIDetectorServerConfig` は `AI_DETECTOR_ENDPOINT_URL` と `AI_DETECTOR_API_KEY` が未設定の場合に即座に例外を投げ、設定漏れを検出する。
- `computeBotScore` はクリック精度・ダブルクリック率・タイピング速度・スクロール速度などを基に 0〜0.99 の bot スコアを算出し、`riskLevel`/`recommendation` を返す。
- `AIDetectorProvider` は 0.5 秒 / 2 秒 / 5 秒のタイマーで `checkDetection` を呼び出し、bot スコアが 0.5 以上ならバッジに警告を表示して OTP 再認証の案内を出す。

### 4.3 reCAPTCHA 連携
- `RecaptchaProvider` (`apps/ecommerce-site/app/components/RecaptchaProvider.tsx`) が Site Key を検出すると Enterprise JS を動的読み込みし、バッジ位置を右下に固定する。Site Key 未設定時は自動的にバッジを非表示にする。
- `/api/security/recaptcha/verify` は `GoogleAuth` を用いて `projects/${PROJECT_ID}/assessments` を呼び出し、`score`, `reasons`, `tokenProperties` を返す。必要な環境変数は `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` のいずれか。

### 4.4 購入フロー統合 (`app/api/purchase/check`)
- 認証済みユーザーのカート情報を取得し、`detectPurchaseAnomaly` で FastAPI の `POST /detect_cluster_anomaly` を呼び出す。レスポンスは `clusteringScore` / `threshold` / `is_anomaly` として返却・保存される。
- `security_mode`, `bot_score`, `security_action`, `detection_reasons` は `logSecurityEvent` 経由で `security_logs` テーブルと `logs/security.log` に記録される。
- `is_anomaly=true` や 403 応答時は OTP 再認証を要求し、正常時は注文テーブルを更新して `orderId` を返す。クラスタスコアはローカルバッジへ即時反映する。

### 4.5 FastAPI 検知 API (`ai-detector/`)
- `POST /detect` は `FeatureExtractor` (`services/feature_extractor.py`) が 26 の LightGBM 特徴量を生成し、`LightGBMModel` の予測値 < 0.5 で `is_bot=true` とする。`persona_features` が存在する場合は `_build_cluster_request` 経由でクラスタ判定を追加し、`persona_detection.is_anomaly=true` なら最終判定を `challenge` にする。
- `POST /detect_cluster_anomaly` は KMeans + IsolationForest モデルをロードし、`prediction == -1` のとき `is_anomaly=true` を返す。`threshold` はクライアント表示用の情報で、判定には直接使用しない。
- `AI_DETECTOR_TRAINING_LOG=1` を設定すると `utils/training_logger.log_detection_sample` が JSONL (`training/browser/data/<label>/behavioral_YYYYMMDD.jsonl`) へ検知リクエスト/レスポンスを追記する。`<label>` には `AI_DETECTOR_LOG_LABEL` の値（`human` / `bot` / 未指定時 `unspecified`）が入る。`AI_DETECTOR_TRAINING_LOG_PATH` で保存先を上書き可能。
- モデルロード失敗時は `HTTP 500` と詳細なエラーメッセージ (`models/...` のパス) を返し、プロセスを落とさずヘルスチェックで `status=degraded` を示す。

### 4.6 ログ / 監査
- `apps/ecommerce-site/app/lib/logger.ts` が JSON 形式のセキュリティイベントを `logs/security.log`, `logs/app.log`, `logs/access.log` に書き込みつつ、`security_logs` テーブルへも INSERT する。
- FastAPI は `logger.info` で特徴量抽出状況やクラスタ ID を出力し、`request_id` を全レスポンスに含めてトレーサビリティを確保する。

## 5. 非機能要件

| 項目 | 要件 |
| --- | --- |
| レイテンシ | FastAPI `/detect` `/detect_cluster_anomaly` はモデルキャッシュ時 500ms 以内、Next.js のヒューリスティック API は 50ms 以内で応答すること。 |
| 可用性 | モデル読み込み失敗時でも API は 500 を返して継続稼働し、`/health` に `status="degraded"` を出力する。フロントは検知 API が利用できない場合でも許可方向でフォールバックする。 |
| 可視化 | ScoreDisplayScript により reCAPTCHA / AI Detector / クラスタリングスコアと閾値を常時表示し、更新時刻を合わせて提示する。 |
| ログ | すべての推論/購入処理で `session_id`, `user_id`, `bot_score`, `action_taken`, `detection_reasons` を `security_logs` + ファイルへ記録する。FastAPI 側は `request_id`, `score`, `is_bot` を INFO ログへ出力する。 |
| テスト | FastAPI は `uv run pytest`、Next.js は `pnpm lint` を CI で実行し、主要フローの回帰を防止する。 |
| データ保護 | 行動データはブラウザメモリと FastAPI 推論中のみ保持し、永続化は `AI_DETECTOR_TRAINING_LOG` が有効な場合の JSONL のみに限定。会員データはローカル SQLite のみで管理する。 |

## 6. 技術スタック / 運用
- **FastAPI サービス (`ai-detector/`)**
  - Python >= 3.10, FastAPI, Uvicorn, LightGBM, scikit-learn, joblib。
  - セットアップ: `cd ai-detector && uv sync`。本番と同じ設定で起動する場合は `uv run ./scripts/run_server.sh --reload`。
  - 学習・分析: `uv sync --group train` や `--group vector --extra cpu` を追加。`training/cluster/create_models.py` でクラスタモデルを再生成。
  - テスト: `uv run pytest`。
- **検証用 EC サイト (`apps/ecommerce-site/`)**
  - Next.js 14 (App Router), React 18, Tailwind CSS, SQLite (`sqlite3` + `sqlite`)。
  - セットアップ: `pnpm install && pnpm run build-sqlite && pnpm run init-db && pnpm run dev -p 3002`。`gcloud-key.json` で reCAPTCHA のサービスアカウントを提供。
  - セキュリティ: `DEPLOY_ENV`, `API_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SITE_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `AI_DETECTOR_ENDPOINT_URL`, `AI_DETECTOR_API_KEY` などを `.env` で管理。
  - ローカルログ: `logs/security.log`, `logs/app.log`, `logs/access.log` が自動生成される。

## 7. 今後の拡張余地
- `SecurityConfig` を UI から切り替えられる管理画面を追加し、`ai-detector` モードと reCAPTCHA の併用をサポートする。
- `BehaviorTracker` の送信先を Next.js のヒューリスティックだけでなく FastAPI `/detect` にも中継できるよう、API Gateway を追加する。
- `security_logs` テーブルを BI/監査ツールへ同期するエクスポートバッチを整備し、過去スコアと reCAPTCHA・OTP イベントを可視化する。
- FastAPI 側へモデルホットリロードやレートリミット/認証 (API Key/JWT) を導入し、外部提供できる堅牢性を確保する。
