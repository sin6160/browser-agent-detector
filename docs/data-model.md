# データモデル設計書

本ドキュメントは FastAPI 製の検知エンジン (`ai-detector/`) と Next.js 製の検証用 EC サイト (`apps/ecommerce-site/`) におけるデータ構造・情報フローをまとめた最新版です。

## 1. 検知エンジン (ai-detector)

### 1.1 統合入力
`POST /detect` が受け取る `UnifiedDetectionRequest` は下表のブロックで構成されます。`browser-agent-sdk/packages/agent-core` の `BehaviorTrackerFacade` が 5 秒ごとに収集したデータを Next.js API から FastAPI へ渡す想定です。

| ブロック | 主なフィールド | 備考 |
| --- | --- | --- |
| `behavioral_data` | `mouse_movements`, `click_patterns`, `keystroke_dynamics`, `scroll_behavior`, `page_interaction` | クライアント側で集計済み統計値。`docs/browser-detection-data.md` を参照。 |
| `recent_actions` (`behavior_sequence`) | `action`, `timestamp`, `x`, `y`, `velocity`, `deltaX`, `deltaY` | LightGBM 用の行動リズム・時間差を算出。現在の実装では直近 6 件を送信。 |
| `device_fingerprint` | `user_agent`, `browser_info.*`, `canvas_fingerprint`, `webgl_fingerprint` | `FeatureExtractor` が `is_mobile` を求める。 |
| `persona_features` (任意) | `age`, `gender`, `prefecture`, `purchase.*` | クラスタ異常検知の入力。 |
| `contextData` | `actionType`, `url`, `page_load_time`, `first_interaction_delay` 等 | トレーニングログの分析・デバッグ用途。 |

### 1.2 LightGBM 特徴量
`services/feature_extractor.py` が以下 26 個の特徴量を計算し、`models/lightgbm_loader.py` が定義する `DEFAULT_FEATURE_NAMES` 順に Booster へ渡します。欠損値は 0 で埋めます。

```
total_duration_ms
first_interaction_delay_ms
avg_time_between_actions
velocity_mean
velocity_max
velocity_std
action_count_mouse_move
action_count_click
action_count_keystroke
action_count_scroll
action_count_idle
is_mobile
click_avg_click_interval
click_click_precision
click_double_click_rate
keystroke_typing_speed
keystroke_key_hold_time
keystroke_key_interval_variance
scroll_speed
scroll_acceleration
pause_frequency
page_session_duration
page_page_dwell_time
page_first_interaction_delay
page_form_fill_speed
```

### 1.3 モデル配置

| ファイル/ディレクトリ | 役割 |
| --- | --- |
| `ai-detector/models/browser/model.txt` | LightGBM Booster |
| `ai-detector/models/persona/kmeans_model.pkl` | 年齢×性別×都道府県のクラスタ割当 |
| `ai-detector/models/persona/cluster_isolation_models.pkl` | クラスタごとの IsolationForest + StandardScaler |
| `ai-detector/models/persona/model_metadata.json` | クラスタ統計・推奨 `threshold` |

`api/dependencies.py` がアプリ起動時に各ファイルをロードし、`DetectionService` / `ClusterDetectionService` へ依存性注入します。ファイルが欠けていると `FileNotFoundError` を送出し、API は `HTTP 500` を返します。

### 1.4 クラスタ異常検知スキーマ
`POST /detect_cluster_anomaly` および `POST /detect` 内部で利用する `ClusterAnomalyRequest` は次の 11 フィールドで構成されます。

```json
{
  "age": 0-120,
  "gender": 1|2,
  "prefecture": 1-47,
  "product_category": 1-11,
  "quantity": >=1,
  "price": >=0,
  "total_amount": >=0,
  "purchase_time": 0-23,
  "limited_flag": 0|1,
  "payment_method": 1-7,
  "manufacturer": 1-20
}
```

`ClusterAnomalyDetector.predict()` は

1. `(age, gender, prefecture)` を KMeans へ入力し `cluster_id` を得る
2. 残り 8 項目を該当クラスタの IsolationForest で推論する
3. `prediction` (1 or -1), `anomaly_score`, `threshold`, `is_anomaly` を返す (`is_anomaly` は現在 `prediction == -1` で計算)

`threshold` はクライアント表示用の参考値で、FastAPI 側の判定では使用しません。

### 1.4.1 トレーニングデータ定義
クラスタリングモデルは `ai-detector/training/cluster/data/ecommerce_clustering_data.csv` を用いて学習されています。このデータは、以下に示す5つのペルソナに基づいた150件の購買行動シミュレーションデータです。

#### データ項目定義
| 項目名 | データ型 | 説明 | 値の範囲 |
|---|---|---|---|
| age | INTEGER | 年齢 | 22, 28, 35, 55, 65 |
| gender | INTEGER | 性別 | 1=男性, 2=女性 |
| prefecture | INTEGER | 都道府県コード | 13=東京, 14=神奈川, 23=愛知, 27=大阪 |
| product_category | INTEGER | 商品カテゴリ | 1-12（11=ギフト券） |
| quantity | INTEGER | 購入数量 | 1-4 |
| price | INTEGER | 単価 | 100円〜200,000円 |
| total_amount | INTEGER | 合計金額 | `price` × `quantity` |
| purchase_time | INTEGER | 購入時間（時） | 0-23 |
| limited_flag | INTEGER | 限定品フラグ | 0=通常品, 1=限定品 |
| payment_method | INTEGER | 決済手段 | 3=クレジットカード（固定） |
| manufacturer | INTEGER | メーカーID | 1-20 |

#### ペルソナ（ユーザープロファイル）
| ペルソナ | 年齢 | 性別 | 居住地 | 特徴 |
|---|---|---|---|---|
| 学生 | 22 | 男性 | 東京 | 夜型の購買行動。ギフト券を多数購入。 |
| オフィスワーカー | 28 | 女性 | 神奈川 | 日中から夜にかけて購買。ギフト券を多数購入。 |
| 技術者 | 35 | 男性 | 東京 | 深夜型の購買行動。ギフト券を多数購入。 |
| 主婦 | 65 | 女性 | 大阪 | 日中の購買行動。ギフト券・限定品は購入しない。 |
| プレミアム会員 | 55 | 男性 | 愛知 | 夜型の購買行動。ギフト券を多数購入。 |

#### 商品カテゴリ一覧
| カテゴリID | 商品ジャンル |
|---|---|
| 1 | PC・スマートフォン |
| 2 | 家電 |
| 3 | 本・雑誌 |
| 4 | お菓子・食品 |
| 5 | スポーツ用品 |
| 6 | ペット用品 |
| 7 | ファッション |
| 8 | 美容・健康 |
| 9 | インテリア・家具 |
| 10 | ゲーム・エンタメ |
| 11 | ギフト券 |
| 12 | その他 |

### 1.5 トレーニングログ
- 環境変数 `AI_DETECTOR_TRAINING_LOG=1` で `utils/training_logger.py` が有効になり、`training/browser/data/<label>/behavioral_YYYYMMDD.jsonl` に `request`・`browser_result`・`persona_result`・`final_decision` を 1 行 JSON で追記します。`<label>` は `AI_DETECTOR_LOG_LABEL` の値（`human` / `bot` / `unspecified`）です。
- `AI_DETECTOR_TRAINING_LOG_PATH` で保存先を変更可能。

## 2. 検証用 EC サイト (apps/ecommerce-site)

### 2.1 データストア
- SQLite (`ecommerce-db.sqlite`) を `sqlite3` + `sqlite` で操作。`app/lib/db.ts` と `scripts/init-db.js` がスキーマ作成とシード投入を担当。
- ファイルベースのログディレクトリ `apps/ecommerce-site/logs/` に `security.log`, `app.log`, `access.log` を出力。
- `localStorage` で `recaptchaScore`, `aiDetectorScore`, `clusteringScore`, `clusteringThreshold` などのオーバーレイスコアを保持。

### 2.2 テーブル定義 (SQLite)

#### `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  age INTEGER,
  gender INTEGER,
  prefecture INTEGER,
  occupation VARCHAR(50),
  member_rank VARCHAR(20) DEFAULT 'bronze',
  registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  last_purchase_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `products`
```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255) NOT NULL,
  category INTEGER,
  brand INTEGER,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  is_limited BOOLEAN DEFAULT FALSE,
  image_path VARCHAR(255),
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `orders`
```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  security_mode VARCHAR(20),
  bot_score FLOAT,
  security_action VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `order_items`
```sql
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `security_logs`
```sql
CREATE TABLE security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id VARCHAR(64) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_path VARCHAR(255),
  request_method VARCHAR(10),
  security_mode VARCHAR(20) NOT NULL,
  bot_score FLOAT,
  risk_level VARCHAR(20),
  action_taken VARCHAR(20) NOT NULL,
  detection_reasons TEXT,
  processing_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `cart_items`
```sql
CREATE TABLE cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  recipient_email VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 ファイルログ (`apps/ecommerce-site/logs/`)
| ファイル | 内容 |
| --- | --- |
| `security.log` | `logSecurityEvent()` が JSON で書き込むセキュリティイベント。 |
| `app.log` | アプリケーションエラー。 |
| `access.log` | HTTP メソッド/URL/レスポンス時間/UA を JSON で記録。 |

### 2.4 データフロー
1. **行動取得**: `BehaviorTracker` がマウス/キー/スクロールを記録し、`/api/security/aidetector/detect` へ送信。レスポンスから `botScore`, `riskLevel`, `reasons` を受け取り `localStorage` とスコアバッジに反映。
2. **reCAPTCHA**: `RecaptchaProvider` がトークンを取得し `/api/security/recaptcha/verify` へ送信。`AIDetectorProvider` は bot スコアに応じてバッジを更新し、必要に応じて OTP 再認証を案内する。
3. **購入チェック**: `/api/purchase/check` がセッション + カート情報を取得し、`detectPurchaseAnomaly()` から FastAPI `POST /detect_cluster_anomaly` を叩く。結果は `clusteringScore`/`threshold` としてクライアントと `security_logs` に記録。
4. **ログ蓄積**: `logSecurityEvent()` が DB と `logs/security.log` を同時に更新。`orders.security_mode` / `bot_score` / `security_action` にも反映。
5. **フォールバック**: FastAPI が応答しない場合やヒューリスティック API がエラーになった場合は「許可」方向へフォールバックし、`detection_reasons` にエラーメッセージを残す。403 応答時は OTP 再認証モードに遷移。

### 2.5 オーバーレイスコア (localStorage)
| キー | 値 | 更新箇所 |
| --- | --- | --- |
| `recaptchaScore` / `recaptchaOriginalScore` | reCAPTCHA Enterprise の最新スコア | `ScoreDisplayScript` |
| `aiDetectorScore` | ブラウザヒューリスティック API の bot スコア (0〜0.99) | `BehaviorTracker.updateSecurityBadge()` |
| `clusteringScore` / `clusteringThreshold` | `POST /api/purchase/check` のクラスタ異常スコア | カートページ |

## 3. 設定サーフェス
- `apps/ecommerce-site/app/lib/security.ts` の `SECURITY_SUITE_LABEL` が常に `'recaptcha+ai-detector'` を指し、reCAPTCHA Enterprise + AI Detector の多層防御が固定で有効になる。
- reCAPTCHA: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_ENTERPRISE_SITE_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`。
- AI Detector: `DEPLOY_ENV`, `API_URL`, `AI_DETECTOR_ENDPOINT_URL`, `AI_DETECTOR_API_KEY`（`AI_DETECTOR_ENDPOINT` / `AI_DETECTOR_API_KEY` で上書き可能）。
- FastAPI 連携: `AI_DETECTOR_TRAINING_LOG`, `AI_DETECTOR_TRAINING_LOG_PATH`, `models/` 配置。

このように、ブラウザで収集した行動ログ → Next.js 内ヒューリスティック → FastAPI クラスタ推論 → SQLite/ファイルログ という流れが一貫したデータモデルで結ばれています。
