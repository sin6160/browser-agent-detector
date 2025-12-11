# データモデル設計書

本ドキュメントは FastAPI 製の検知エンジン (`ai-detector/`) と Next.js 製の検証用 EC サイト (`apps/ecommerce-site/`) におけるデータ構造・情報フローをまとめた最新版です。

## 1. 検知エンジン (ai-detector)

### 1.1 統合入力
`browser-agent-sdk/packages/agent-core` の `BehaviorTrackerFacade` がブラウザ操作・指紋・文脈情報を 5 秒ごと（`captureCriticalAction()` 呼び出し時は即時）に `BehaviorSnapshot` として収集し、Next.js Edge API `/api/security/aidetector/detect` で snake_case へ変換した上で FastAPI `POST /detect` へ転送します（`UnifiedDetectionRequest` は `extra="allow"` のため `ip_address` やヘッダーも保持されます）。

| ブロック | 主なフィールド | 備考 |
| --- | --- | --- |
| `behavioral_data` | `mouse_movements[{timestamp,x,y,velocity}]`（直近200件）、`click_patterns{avg_click_interval,click_precision,double_click_rate}`, `keystroke_dynamics{typing_speed_cpm,key_hold_time_ms,key_interval_variance}`, `scroll_behavior{scroll_speed,scroll_acceleration,pause_frequency}`, `page_interaction{session_duration_ms,page_dwell_time_ms,first_interaction_delay_ms,navigation_pattern,form_fill_speed_cpm,paste_ratio}` | `EventCollector` がマウス/クリック/キー/スクロール/ペースト/フォーム操作をバッファ（例: mouse 1000 件）し、`MetricsAggregator` が平均間隔・精度・速度・加速度・フォーム入力速度（focus 数/分）・`paste_ratio`（pasteEvents/inputEvents）などを算出。`session_duration_ms` と `page_dwell_time_ms` はページロードからの経過時間。 |
| `recent_actions` (`behavior_sequence`) | `action`, `timestamp`（+ 任意 `metadata`） | 直近 120 件を保持。`mouse_move` は約 5Hz でダウンサンプルし、`click`、`paste`、`focus`/`blur`、`visibilitychange` (`visible`/`hidden`)、タイマー起動時の `TIMED_SHORT|MEDIUM|LONG` などを記録。時刻差やアクション頻度特徴量に利用。 |
| `device_fingerprint` | `screen_resolution`, `timezone`, `user_agent`, `user_agent_hash`, `user_agent_brands`, `vendor`, `app_version`, `platform`, `browser_info.*`, `canvas_fingerprint`, `webgl_fingerprint`, `http_signature_state`, `anti_fingerprint_signals[]`, `network_fingerprint_source`, `tls_ja4?`, `http_signature?` | `FingerprintRegistry` が UA 判定と canvas/webGL ハッシュを生成し、`navigator.webdriver` 等の異常シグナル（`navigator_webdriver_true`, `headless_user_agent`, `plugins_empty` など）を `anti_fingerprint_signals` に格納。TLS/HTTP 指紋は未設定時 `missing/unknown` として扱う。 |
| `persona_features` (任意) | `age`, `gender`, `prefecture`, `purchase.*` | クラスタ異常検知の入力。 |
| `context` (`contextData`) | `action_type`, `url`, `siteId`, `pageLoadTime`, `firstInteractionTime`, `firstInteractionDelay`, `userAgent`, `locale`, `extra` | `BehaviorTracker` が計測時の文脈を付与。`action_type` は `PERIODIC_SNAPSHOT`/`TIMED_SHORT`/`PAGE_BEFORE_UNLOAD` などに変換され、特徴量の one-hot に使用。 |
| `ip_address` / `headers` | Edge API が追加 | FastAPI スキーマで無視されるが、トレーニングログや将来のモデル拡張用に保持。 |

### 1.1.1 クライアントで取得している主なブラウザ操作
- **マウス**: `mousemove` を 50ms スロットルで記録（速度と座標を保持、直近1000件）。約 4 回に 1 回を `recent_actions` に追加。
- **クリック**: ターゲット要素・ダブルクリック判定を保持し、全クリック数とダブルクリック数から精度・二重率を算出。
- **キー入力**: パスワード欄を除外し、修飾キー判定とホールド時間を保持。タイピング速度（文字/分）とキー間隔分散を算出。
- **スクロール**: 100ms スロットルで速度と加速度を算出し、停止回数/総スクロール数から `pause_frequency` を計算。
- **ペースト/フォーム操作**: `beforeinput` で paste を検知、input/form インタラクション回数から `form_fill_speed_cpm` と `paste_ratio` を計算。focus/blur は `recent_actions` に記録。
- **デバイス指紋**: UA/ブランド/ベンダ/OS/プラットフォームに加えて、canvas/webGL ハッシュ、`anti_fingerprint_signals`（webdriver, headless UA, plugins 空, mobile UA 無タッチなど）を取得。TLS/HTTP 署名値は未実装だが、`tls_ja4`/`http_signature` フィールドと「missing」フラグ（特徴量）が用意されている。

### 1.2 LightGBM 特徴量
`services/feature_extractor.py` は行動時系列・集計指標・デバイス指紋から多数の特徴量を生成し、`ai-detector/models/browser/lightgbm_metadata.json` で定義された 28 個を LightGBM へ入力します（欠損は 0 埋め、`context.action_type` を one-hot 化）。現在の Booster が参照する特徴量は次の通りです。

```
mouse_movements_count
mouse_velocity_mean
mouse_velocity_std
mouse_velocity_max
click_avg_interval
click_precision
click_double_rate
keystroke_speed
keystroke_hold
keystroke_interval_var
scroll_speed
scroll_acc
scroll_pause
page_session_duration_ms
page_dwell_time_ms
page_first_interaction_delay_ms
page_form_fill_speed
page_paste_ratio
seq_total_actions
seq_count_mouse_move
seq_count_click
seq_count_keystroke
seq_count_scroll
seq_count_TIMED_SHORT
seq_count_TIMED_LONG
action_type_PAGE_BEFORE_UNLOAD
action_type_PERIODIC_SNAPSHOT
action_type_TIMED_SHORT
```

- 上記以外にも `time_between_actions_*` や `mouse_path_length`、各アクションの毎秒レート、`fingerprint_http_signature_missing` / `fingerprint_tls_ja4_missing` など多数の補助特徴が `features_extracted` に含まれ、トレーニングログや将来のモデル再学習時に活用できます。

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

### 2.2 テーブル定義 (Cloudflare D1 / SQLite)
`apps/ecommerce-site/sql/001_schema.sql` の D1 マイグレーションと、ローカル用の `scripts/init-db.js` が同じ構成を生成します。主なテーブルは以下のとおりです。

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
  pc1 REAL,
  pc2 REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
`pc1` / `pc2` は商品特徴量の主成分などを格納するための追加カラム（シードデータでも使用）。

#### `orders`
```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  security_mode VARCHAR(20),
  bot_score FLOAT NULL,
  security_action VARCHAR(20) NULL,
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
  user_id INTEGER NULL REFERENCES users(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_path VARCHAR(255),
  request_method VARCHAR(10),
  security_mode VARCHAR(20) NOT NULL,
  bot_score FLOAT NULL,
  risk_level VARCHAR(20) NULL,
  action_taken VARCHAR(20) NOT NULL,
  detection_reasons TEXT NULL,
  processing_time_ms INTEGER NULL,
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
  recipient_email VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `sessions`
```sql
CREATE TABLE sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER
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
