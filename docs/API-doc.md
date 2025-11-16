# AIエージェント検知 API 仕様書

FastAPI 製の検知サーバー (`ai-detector/`) で提供している REST API の最新版です。ローカル開発では `http://localhost:8000` を基点とし、現在は認可を要求していません。`Content-Type: application/json` を付与して直接呼び出してください。

## 1. エンドポイント一覧

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET /` | サービス名とバージョンの取得 |
| `GET /health` | LightGBM / クラスタモデルのロード状態確認 |
| `POST /detect` | ブラウザ行動 + ペルソナ情報の統合判定 |
| `POST /detect_cluster_anomaly` | 会員属性 + 購入データのみのクラスタ異常判定 |

## 2. POST /detect

### 2.1 概要
`UnifiedDetectionRequest` を入力し、LightGBM (ブラウザ行動) と KMeans + IsolationForest (ペルソナ) を組み合わせた最終判定を返します。`persona_features` を省略するとブラウザ行動のみを評価します。推論結果は `utils/training_logger.log_detection_sample` により（必要に応じて）JSONL へ保存されます。

### 2.2 リクエストボディ
ブラウザ SDK (`browser-agent-sdk/packages/agent-core`) はすべてのフィールドを snake_case で送信し、`behavior_sequence` が正式名称です（`recent_actions` は旧エイリアスですが後方互換のために受け付けます）。`context` にはページ遷移や初回操作までの遅延などが含まれ、Next.js の `/api/security/aidetector/detect` では camelCase → snake_case 変換済みの JSON が FastAPI へ渡ります。

```json
{
  "session_id": "sess_abc123",
  "request_id": "req_1703123456789",
  "timestamp": 1703123456789,
  "behavioral_data": {
    "mouse_movements": [{ "timestamp": 10, "x": 120.4, "y": 85.1, "velocity": 1.5 }],
    "click_patterns": {
      "avg_click_interval": 1200,
      "click_precision": 0.85,
      "double_click_rate": 0.12
    },
    "keystroke_dynamics": {
      "typing_speed_cpm": 185,
      "key_hold_time_ms": 110,
      "key_interval_variance": 0.28
    },
    "scroll_behavior": {
      "scroll_speed": 460,
      "scroll_acceleration": 2.4,
      "pause_frequency": 0.18
    },
    "page_interaction": {
      "session_duration_ms": 52000,
      "page_dwell_time_ms": 31000,
      "first_interaction_delay_ms": 240,
      "navigation_pattern": "linear",
      "form_fill_speed_cpm": 3.1,
      "paste_ratio": 0.04
    }
  },
  "behavior_sequence": [
    { "action": "mouse_move", "timestamp": 1703123456789, "x": 100, "y": 120, "velocity": 1.1 },
    { "action": "click", "timestamp": 1703123457100, "x": 210, "y": 360 },
    { "action": "keystroke", "timestamp": 1703123457600, "key": "Enter", "is_modifier": false }
  ],
  "device_fingerprint": {
    "screen_resolution": "1920x1080",
    "timezone": "Asia/Tokyo",
    "user_agent": "Mozilla/5.0 (...)",
    "user_agent_hash": "f1a2b3c4",
    "user_agent_brands": ["Chromium/120", "Google Chrome/120"],
    "vendor": "Google Inc.",
    "app_version": "5.0 (Windows)",
    "platform": "Win32",
    "browser_info": {
      "name": "Chrome",
      "version": "120.0.0.0",
      "os": "Windows 11",
      "engine": "Blink",
      "is_chromium_based": true,
      "is_chrome": true,
      "is_pure_chromium": false
    },
    "canvas_fingerprint": "canvas-hash",
    "webgl_fingerprint": "webgl-hash",
    "http_signature_state": "unknown",
    "anti_fingerprint_signals": ["no_debug_info"],
    "network_fingerprint_source": "client",
    "tls_ja4": "ja4_hash",
    "http_signature": "sha256(cf-ray:...)"
  },
  "persona_features": {
    "age": 35,
    "gender": 2,
    "prefecture": 13,
    "purchase": {
      "product_category": 7,
      "quantity": 1,
      "price": 25000,
      "total_amount": 25000,
      "purchase_time": 14,
      "limited_flag": 1,
      "payment_method": 3,
      "manufacturer": 17
    }
  },
  "context": {
    "ip_address": "203.0.113.10",
    "current_page": "/products/limited-01",
    "action_type": "checkout",
    "page_load_time": 1703123456123,
    "first_interaction_time": 1703123456363,
    "first_interaction_delay": 240,
    "site_id": "apps/ecommerce-site"
  }
}
```

- `request_id`: フロントで発行した ID をそのまま返す。FastAPI 側で UUID を生成していた旧挙動から置き換わっている。
- `behavioral_data`: `docs/browser-detection-data.md` 準拠。`FeatureExtractor` が 26 個の LightGBM 特徴量（`keystroke_typing_speed_cpm`, `page_session_duration_ms`, `page_paste_ratio` など）へマッピングする。
- `behavior_sequence`: ミリ秒精度のイベント列。旧フィールド名 `recent_actions` も受付可。
- `device_fingerprint`: `browser_info.*` に加えて `canvas_fingerprint` / `webgl_fingerprint` / `http_signature_state` / `anti_fingerprint_signals` / `network_fingerprint_source` / `tls_ja4` / `http_signature` を格納する。TLS/JA4 は Next.js や CDN 側で取得できる場合のみ付与し、未収集時は `http_signature_state: "missing"` を送る。
- `persona_features`: 会員プロフィール + 最新購入情報。`purchase.price` 等は数値で送信する。
- `context`: 任意のメタ情報。現在はログ分析・トレーニングログでのみ使用する。

> **補足:** 第三者サイトでも `@browser-agent-sdk/node-bridge` 内の `extractNetworkFingerprint()` を呼び出すだけで TLS/JA4 と HTTP 署名を生成できるが、CDN 終端等で情報が取得できない場合は空のままでも構わない。その場合は `http_signature_state: 'missing'` をセットし、TLS フィンガープリントは別チャネル（Cloudflare Workers 等）で計測する。

### 2.3 レスポンス

```json
{
  "session_id": "sess_abc123",
  "request_id": "0bb29fd0-7bb7-4d05-8c53-53f7e73fee5d",
  "browser_detection": {
    "score": 0.72,
    "is_bot": false,
    "confidence": 0.44,
    "raw_prediction": 0.72,
    "features_extracted": {
      "total_duration_ms": 3800,
      "action_count_click": 2,
      "...": 0
    }
  },
  "persona_detection": {
    "is_provided": true,
    "cluster_id": 2,
    "prediction": 1,
    "anomaly_score": 0.18,
    "threshold": -0.05,
    "is_anomaly": false
  },
  "final_decision": {
    "is_bot": false,
    "reason": "normal",
    "recommendation": "allow"
  }
}
```

### 2.4 判定ロジック
- `score` / `raw_prediction` は LightGBM Booster の出力で、`score < 0.5` なら `browser_detection.is_bot=true`。
- `persona_features` が存在するときはクラスタ異常判定を追加し、`persona_detection.is_anomaly=true` (=`prediction == -1`) の場合 `final_decision.recommendation` は `challenge`、`reason` は `persona_anomaly` となる。
- 両方とも問題なければ `recommendation=allow`。
- 成功レスポンスには常に `request_id` を含め、`logs/training/*.jsonl` や EC サイトの `security_logs` と突合可能にする。

## 3. POST /detect_cluster_anomaly

### 3.1 概要
年齢・性別・都道府県 + 8 つの購入指標からクラスタ判定と IsolationForest のスコアを返します。EC サイト (`apps/ecommerce-site/app/lib/purchase-detection.ts`) が購入前チェックで直接利用しています。

### 3.2 リクエスト例

```json
{
  "age": 42,
  "gender": 1,
  "prefecture": 13,
  "product_category": 7,
  "quantity": 2,
  "price": 25000,
  "total_amount": 50000,
  "purchase_time": 21,
  "limited_flag": 1,
  "payment_method": 3,
  "manufacturer": 17
}
```

- `gender`: 1=男性, 2=女性
- `prefecture`: JIS コード (1〜47)
- `payment_method` などのカテゴリ ID はフロントエンド `apps/ecommerce-site/app/lib/purchase-detection.ts` に準拠。

### 3.3 レスポンス例

```json
{
  "cluster_id": 3,
  "prediction": 1,
  "anomaly_score": 0.12,
  "threshold": -0.05,
  "is_anomaly": false,
  "request_id": "1477e3f7-1e44-4b9b-9ac5-8eb3638b4050"
}
```

`is_anomaly` は `prediction == -1` のときのみ `true` になります。`threshold` は観測用の値であり、現在の実装では判定閾値としては使用していません。

## 4. GET /

疎通確認用の簡易レスポンス。

```json
{ "name": "AI Agent Detection API", "version": "1.0.0", "status": "running" }
```

## 5. GET /health

LightGBM とクラスタモデルのロード状態を返します。どちらかが失敗すると `status: "degraded"` になり、`model_loaded` / `cluster_model_loaded` の真偽値で切り分けできます。

```json
{
  "status": "healthy",
  "model_loaded": true,
  "cluster_model_loaded": true,
  "timestamp": 1703123456789
}
```

## 6. エラー共通仕様

FastAPI 標準 (`{"detail": "..."}`) のエラー形式を採用しています。

- 400: バリデーションエラー（Pydantic）
- 500: LightGBM/クラスタモデル未配置、推論中例外など

例:

```json
{
  "detail": "検知処理中にエラーが発生しました: LightGBMモデルファイルが見つかりません: models/browser/model.txt"
}
```

どの例外もアプリケーションログに記録されるため、詳細調査は `ai-detector` のログを参照してください。

## 7. トレーニングログ / 環境変数
- `AI_DETECTOR_TRAINING_LOG=1` を設定すると `training/browser/data/<label>/behavioral_YYYYMMDD.jsonl` が生成され、`request`, `browser_result`, `persona_result`, `final_decision` を 1 行 JSON で追記します。`<label>` には `AI_DETECTOR_LOG_LABEL` を指定できます（例: `human` / `bot`）。
- `AI_DETECTOR_TRAINING_LOG_PATH` で保存先を上書き可能 (相対パスは `ai-detector/` からの相対)。
- モデルファイルは `models/browser/model.txt`, `models/persona/*.pkl`, `models/persona/model_metadata.json` に配置し、起動時に読み込まれます。見つからない場合は 500 応答と共に詳細パスを返します。
