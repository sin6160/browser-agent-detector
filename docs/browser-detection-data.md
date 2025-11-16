# ブラウザ操作データ仕様 (behavioral_data)

AI エージェント検知 API (`POST /detect`) へ送信するブラウザ行動ログの最新版仕様です。`browser-agent-sdk/packages/agent-core` の `BehaviorTrackerFacade` がこの仕様に従ってデータを生成し、Next.js の `/api/security/aidetector/detect` や FastAPI の `/detect` に渡します。TLS/JA4 や HTTP 署名はクライアントでは取得できない環境もあるため、可能な場合のみサーバー側で `extractNetworkFingerprint()` を呼び出して `device_fingerprint` へ付与します（取得できない場合は `http_signature_state: 'missing'` 等をセット）。

## 0. 実装の参照
- 行動収集: `browser-agent-sdk/packages/agent-core`
- プロバイダー: `apps/ecommerce-site/app/components/BehaviorTrackerProvider.tsx`
- スコア表示: `apps/ecommerce-site/app/components/ScoreDisplayScript.tsx`
- サーバー側スキーマ: `ai-detector/src/schemas/detection.py`

## 1. データカテゴリ

| 区分 | 目的 | 主なフィールド |
| --- | --- | --- |
| 行動集計 (`behavioral_data`) | クライアントで計算した統計値 | `mouse_movements`, `click_patterns`, `keystroke_dynamics`, `scroll_behavior`, `page_interaction` |
| 行動シーケンス (`recent_actions` / `behavior_sequence`) | ミリ秒精度の生イベント列 | `action`, `timestamp`, `x`, `y`, `velocity`, `key`, `deltaX`, `deltaY` |
| デバイス指紋 (`device_fingerprint`) | ブラウザ/OS 判定 | `user_agent`, `browser_info`, `canvas_fingerprint`, `webgl_fingerprint`, `user_agent_brands` |
| コンテキスト (`contextData`) | 画面名・遷移情報・初回操作時刻 | `actionType`, `url`, `page_load_time`, `first_interaction_time`, `first_interaction_delay`, `ipAddress` など |

## 2. 行動集計フィールド

`BehaviorTracker` は 2 秒キャッシュを持ち、最新のマウス/クリック/キー/スクロール統計を返します。代表値は整数・浮動小数のみを使用してください。

### 2.1 `mouse_movements`
カーソル軌跡のサンプル。速度だけでなく座標も保持し、最大 1,000 件に丸めます。

```json
"mouse_movements": [
  { "timestamp": 1000, "x": 120.4, "y": 85.1, "velocity": 1.5 },
  { "timestamp": 1130, "x": 133.0, "y": 100.4, "velocity": 1.7 }
]
```

### 2.2 `click_patterns`

```json
"click_patterns": {
  "avg_click_interval": 1180,      // ms
  "click_precision": 0.82,         // 0-1
  "double_click_rate": 0.08        // 0-1
}
```

### 2.3 `keystroke_dynamics`

```json
"keystroke_dynamics": {
  "typing_speed_cpm": 190,         // Characters Per Minute
  "key_hold_time_ms": 115,         // ms
  "key_interval_variance": 48      // ms^2
}
```

### 2.4 `scroll_behavior`

```json
"scroll_behavior": {
  "scroll_speed": 420,             // px/s (差分 ÷ 経過時間)
  "scroll_acceleration": 2.1,      // 速度差分
  "pause_frequency": 0.16          // 500ms 以上停止した割合
}
```

### 2.5 `page_interaction`

```json
"page_interaction": {
  "session_duration_ms": 58000,
  "page_dwell_time_ms": 34000,
  "first_interaction_delay_ms": 180,
  "navigation_pattern": "linear",
  "form_fill_speed_cpm": 180,
  "paste_ratio": 0.12
}
```

## 3. 行動シーケンス (`recent_actions`)

`FeatureExtractor` はイベント列のリズムを解析します。`BehaviorTracker` は最新 6 件を `timestamp` 昇順で返しています。サーバーへ送る際は必要に応じて件数を増やしても構いません。

```json
"recent_actions": [
  { "action": "mouse_move", "timestamp": 1703123456789, "x": 400, "y": 250, "velocity": 1.3 },
  { "action": "click", "timestamp": 1703123457020, "x": 420, "y": 270 },
  { "action": "keystroke", "timestamp": 1703123457600, "key": "Enter", "is_modifier": false },
  { "action": "scroll", "timestamp": 1703123458200, "deltaY": 120, "velocity": 0.7 }
]
```

- `timestamp`: 13 桁のエポック ms。
- `velocity`: 該当する場合のみ数値を設定。
- `deltaX` / `deltaY`: スクロール量を表す場合に利用。
- `is_modifier`: Shift/Ctrl などの修飾キーの場合 `true`。

## 4. デバイス指紋 (`device_fingerprint`)

```json
"device_fingerprint": {
  "screen_resolution": "1920x1080",
  "timezone": "Asia/Tokyo",
  "user_agent": "Mozilla/5.0 ...",
  "user_agent_hash": "abcd1234",
  "user_agent_brands": ["Chromium/120", "Not:A-Brand/8"],
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
  "webgl_fingerprint": "webgl-hash"
}
```

- `browser_info` は `BehaviorTracker` が UA 解析して算出。将来的なルール追加にも備え、未使用でも保持する。
- `user_agent_hash` は簡易ハッシュ (32bit) で、平文とセットで送信しても良い。
- `http_signature_state` は `unknown` / `missing` / `valid` などを利用し、TLS/HTTP 指紋が取得できていない場合は `missing` を明示する。
- `network_fingerprint_source` は `client`（ブラウザで取得）/`server`（Next.js 等で補完）を区別する任意フィールド。

## 5. コンテキスト (`contextData`)

`contextData` は必須ではありませんが、`utils/training_logger.py` で分析できるよう以下を推奨します。

| フィールド | 例 | 用途 |
| --- | --- | --- |
| `actionType` | `"PAGE_VIEW_CART"` / `"TIMED_LONG"` | モード別評価 |
| `url` | `"https://localhost:3002/cart"` | ページ識別 |
| `page_load_time` | `1703123456000` | 初回操作との差分計算 |
| `first_interaction_time` | `1703123456200` | 行動開始時刻 |
| `first_interaction_delay` | `200` | ms単位の遅延 |
| `userAgent` | `navigator.userAgent` | フロントログとの突合 |

## 6. 送信タイミングと制約
- `BehaviorTracker` は 5 秒ごとに `/api/security/aidetector/detect` へデータを送信し、`beforeunload` でも最終パケットを送る。
- 2 秒以内に同じデータが必要な場合はキャッシュを返すため、連続で `getBehavioralData()` を呼び出すと同一値になる点に注意。
- 1 リクエストあたり 1,500 イベント以内を推奨（`mouse_movements` 等の総和）。Front 実装ではリングバッファで自動的に切り詰めている。
- `localStorage` には AI / reCAPTCHA / クラスタリングスコアが保存され、`ScoreDisplayScript` がページロードごとに読み込み直す。

## 7. 品質ルール
1. 数値は必ず `number` 型で送る（文字列禁止）。
2. `mouse_movements` / `recent_actions` は `timestamp` 昇順を維持。
3. 計測できない項目は 0 で埋めずプロパティ自体を省略する。
4. センシティブな文字列（パスワード入力など）は追跡対象外にする。`BehaviorTracker` では `type=password` の要素を除外している。
5. `sessionId` が未設定の場合は FastAPI 側で UUID を生成するが、同一ブラウザから継続送信するならクライアントで固定 ID を払い出す。

この仕様に沿って `POST /detect` へデータを送ることで、`FeatureExtractor` が安定して `total_duration_ms`, `velocity_std`, `click_*` などの特徴量を再現でき、`ai-detector` の推論と `apps/ecommerce-site` の可視化を整合させられます。

## 8. リクエスト例

```jsonc
{
  "sessionId": "sess_xxxxx",
  "requestId": "req_xxxxx",
  "timestamp": 1763190531352,
  "deviceFingerprint": {
    "screen_resolution": "1920x1080",
    "timezone": "Asia/Tokyo",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "user_agent_hash": "-6c4977c",
    "user_agent_brands": ["Chromium/142", "Google Chrome/142", "Not_A Brand/99"],
    "vendor": "Google Inc.",
    "app_version": "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "platform": "Win32",
    "browser_info": {
      "name": "Google Chrome",
      "version": "142.0.0.0",
      "os": "Windows",
      "engine": "Blink",
      "is_chromium_based": true,
      "is_chrome": true,
      "is_pure_chromium": false
    },
    "canvas_fingerprint": "423cf62c",
    "webgl_fingerprint": "-571e47b5",
    "http_signature_state": "missing",
    "anti_fingerprint_signals": ["no_anti_fingerprint_anomalies"],
    "network_fingerprint_source": "client"
  },
  "behavioralData": {
    "mouse_movements": [{ "timestamp": 1763190530524, "x": 1185, "y": 388, "velocity": 0 }],
    "click_patterns": { "avg_click_interval": 0, "click_precision": 0.85, "double_click_rate": 0 },
    "keystroke_dynamics": { "typing_speed_cpm": 180, "key_hold_time_ms": 0, "key_interval_variance": 0 },
    "scroll_behavior": { "scroll_speed": 0.64, "scroll_acceleration": 2.1, "pause_frequency": 0 },
    "page_interaction": {
      "session_duration_ms": 10062,
      "page_dwell_time_ms": 10062,
      "first_interaction_delay_ms": 414,
      "navigation_pattern": "linear",
      "form_fill_speed_cpm": 0,
      "paste_ratio": 0
    }
  },
  "context": {
    "actionType": "PERIODIC_SNAPSHOT",
    "url": "http://localhost:3002/products",
    "siteId": "localhost",
    "pageLoadTime": 1763190526306,
    "firstInteractionTime": 1763190530524,
    "firstInteractionDelay": 414,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
    "locale": "ja"
  },
  "recent_actions": [{ "action": "TIMED_SHORT", "timestamp": 1763190526932 }]
}
```

> **TLS 指紋に関する注意**: 上記サンプルでは `http_signature_state` が `missing` ですが、Cloudflare 等で `cf-ja4` などを受け取れる場合は Next.js (サーバー) 側で `tls_ja4` / `http_signature` を追加し、`network_fingerprint_source: "server"` として FastAPI へリレーします。
