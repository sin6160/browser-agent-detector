# AIエージェント検知サービス

FastAPI と LightGBM を用いた行動ログベースの AI エージェント検知 API。クラスタ異常検知やベクトル化ツールなどの補助スクリプトも同梱しています。

## 手順

### 初期セットアップ〜API 起動

```bash
cd ai-detector
uv sync
export UV_PROJECT_ENVIRONMENT="$PWD/.venv"
uv run ./scripts/run_server.sh --reload
```

#### 学習用ログを有効にして起動したい場合

```bash
cd ai-detector
uv sync
uv run ./scripts/run_server_with_logs.sh --reload
```

`run_server_with_logs.sh` は `AI_DETECTOR_TRAINING_LOG=1` とログ保存先（デフォルト `training/browser/data`）を自動で設定します。`AI_DETECTOR_LOG_LABEL=human|bot` を併用すると `training/browser/data/<label>/` 以下へ書き分けられます（未指定時は `unspecified/`）。別ディレクトリへ保存したい場合は実行前に `export AI_DETECTOR_TRAINING_LOG_PATH=/path/to/logs` を指定してください。

`python` で直接起動したい場合は下記のように環境変数を付与して `uvicorn` を呼び出せば同じ挙動になります。

```bash
cd ai-detector
uv sync
AI_DETECTOR_LOG_LABEL=human \
AI_DETECTOR_TRAINING_LOG=1 \
AI_DETECTOR_TRAINING_LOG_PATH=./training/browser/data \
uv run python -m uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload
```

### 追加依存グループ（必要なものだけ実行してください）

```bash
cd ai-detector
uv sync --group train                        # モデル生成やデータ分析を行う場合
uv sync --group vector --extra cpu           # persona ベクトル化ツール (GPU 環境は --extra gpu)
```

### テスト実行

```bash
cd ai-detector
uv run pytest
```

### 補助スクリプト例

```bash
cd ai-detector
uv run python training/cluster/create_models.py   # cluster モデル (KMeans/IsolationForest) の再生成
uv run python training/persona/run_vectorization.py
uv run python training/persona/run_pca_analysis.py
```

その他のスクリプトも `uv run python <path/to/script>.py` で呼び出せます。

## ディレクトリ構成

```
ai-detector/
├─ README.md
├─ pyproject.toml        # uv 管理
├─ src/                  # アプリ本体 (FastAPI, サービス層, モデルローダー)
│  ├─ api/
│  ├─ models/
│  ├─ schemas/
│  ├─ services/
│  ├─ utils/
│  └─ config.py
├─ models/               # 推論で利用する学習済みモデル
│  ├─ browser/model.txt
│  └─ persona/*.pkl, model_metadata.json
├─ data/
│  └─ raw/               # ヒューマンログやトレーニング用データ
├─ training/             # モデル生成・分析スクリプト
│  ├─ cluster/create_models.py
│  └─ persona/           # 商品説明ベクトル化 & PCA 可視化ツール
│     ├─ run_vectorization.py
│     └─ run_pca_analysis.py
├─ tests/                # FastAPI 統合テスト
└─ scripts/
   ├─ run_server.sh              # 通常起動
   └─ run_server_with_logs.sh    # 行動ログ収集モード付き起動
```

## セットアップと実行の詳細

- `uv sync` で FastAPI + モデル推論に必要な最小構成を同期します。
- トレーニング系の依存が欲しい場合は `--group train`、NLP ベクトル化ツールを使う場合は `--group vector` を追加で同期してください（PyTorch/SentenceTransformers を含むため重めです）。
- サーバーは `uv run ./scripts/run_server.sh --reload` で起動し、`--reload` には必要なら追加で `uvicorn` の引数を渡せます。
- ブラウザ操作ログ（学習用 JSONL）を収集したい場合は `uv run ./scripts/run_server_with_logs.sh --reload` を使用します。
- 起動後、`http://localhost:8000` で API が利用可能、`http://localhost:8000/docs#/` で Swagger UI が開きます。

### ブラウザ操作ログ収集モード
- 環境変数 `AI_DETECTOR_TRAINING_LOG=1` が設定されていると、`POST /detect` で受信したリクエストと判定結果を `training/browser/data/<label>/behavioral_YYYYMMDD.jsonl` に追記保存します（1レコード=1行の JSON）。`<label>` には `AI_DETECTOR_LOG_LABEL` の値（`human` / `bot` / 未設定時 `unspecified`）が入ります。
- 保存先は `AI_DETECTOR_TRAINING_LOG_PATH` で上書き可能です。相対パスを渡した場合は `ai-detector/` からの相対パスとして解決されます。
- 通常運用時はログ収集をオフにするため、デフォルトの `run_server.sh` では環境変数を設定していません。

### ブラウザモデルを読み込めない / 無効化したい場合
- 旧フォーマットの `model.txt` しかない場合など、LightGBM モデルを一時的に無効化したいときは `AI_DETECTOR_DISABLE_BROWSER_MODEL=1` を設定してください。
- このモードで `POST /detect` を呼び出すと `503 Service Unavailable` が返ります（ブラウザ判定はスキップされるため、挙動確認や他モジュールの開発専用モードです）。

```bash
AI_DETECTOR_DISABLE_BROWSER_MODEL=1 uv run ./scripts/run_server.sh --reload
```

## API 概要

### `POST /detect`

ブラウザ行動と任意の購入ペルソナ情報を入力に取り、LightGBM + クラスタ異常検知を組み合わせた判定結果を返します。

リクエスト例:

```json
{
  "sessionId": "user-session-123",
  "behavioral_data": {
    "mouse_movements": [{ "timestamp": 1700000000000, "x": 400, "y": 300, "velocity": 1.2 }],
    "click_patterns": { "avg_click_interval": 800, "click_precision": 0.8, "double_click_rate": 0.05 },
    "keystroke_dynamics": { "typing_speed": 180, "key_hold_time": 120, "key_interval_variance": 50 },
    "scroll_behavior": { "scroll_speed": 250, "scroll_acceleration": 2.0, "pause_frequency": 0.1 },
    "page_interaction": { "session_duration": 45, "page_dwell_time": 45, "first_interaction_delay": 500, "form_fill_speed": 3.0 }
  },
  "recent_actions": [
    { "action": "mouse_move", "timestamp": 1700000000000, "x": 400, "y": 300, "velocity": 1.2 },
    { "action": "click", "timestamp": 1700000000900, "x": 430, "y": 330 }
  ],
  "device_fingerprint": {
    "screen_resolution": "1920x1080",
    "timezone": "Asia/Tokyo",
    "user_agent": "Mozilla/5.0 ...",
    "user_agent_hash": "abcd1234",
    "user_agent_brands": ["Chromium/120"],
    "vendor": "Google Inc.",
    "app_version": "5.0 (Windows)",
    "platform": "Win32",
    "browser_info": {
      "name": "Google Chrome",
      "version": "120.0.0.0",
      "os": "Windows 10",
      "engine": "Blink",
      "is_chromium_based": true,
      "is_chrome": true,
      "is_pure_chromium": false
    },
    "canvas_fingerprint": "canvas-hash",
    "webgl_fingerprint": "webgl-hash"
  },
  "persona_features": {
    "age": 35,
    "gender": 1,
    "prefecture": 13,
    "purchase": {
      "product_category": 1,
      "quantity": 1,
      "price": 5000,
      "total_amount": 5000,
      "purchase_time": 14,
      "limited_flag": 0,
      "payment_method": 3,
      "manufacturer": 5
    }
  }
}
```

レスポンス例:

```json
{
  "session_id": "user-session-123",
  "request_id": "uuid",
  "browser_detection": {
    "score": 0.24,
    "is_bot": false,
    "confidence": 0.52,
    "raw_prediction": 0.24,
    "features_extracted": { "...": 0.0 }
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

`persona_features` を省略した場合でもブラウザ行動のみで判定が行われ、`persona_detection.is_provided` が `false` として返ります。

## テスト

FastAPI のエンドポイントテストは pytest で実行します。コマンドは「テスト実行」ブロックにまとめてあります。

## 補助スクリプト

- `training/cluster/create_models.py`
  - `data/raw/persona/ecommerce_clustering_data.csv` を元に KMeans + IsolationForest モデルを再生成し、`models/persona/` 配下の `kmeans_model.pkl` / `cluster_isolation_models.pkl` / `model_metadata.json` を上書きします。API で新しいクラスタモデルを使いたい場合は、このスクリプトを実行してモデルファイルを更新してください。
- `training/persona/vectorize_product_descriptions.py` など
  - 商品カテゴリ説明文をベクトル化して PCA で可視化する分析ツール群です。推論 API のモデル (`models/persona/*.pkl`) とは独立しているため、自動的にクラスタモデルへ反映されたりはしません。
- `training/browser/train_lightgbm.py`
  - `training/browser/data/{human,bot}` などに蓄積した行動ログ (JSON/JSONL) を glob で収集し、推論時と同じ特徴量群で LightGBM ブラウザモデルを再学習します。セッション単位でリークを避けた分割や `--auto-scale-pos-weight` によるクラス重み調整、`--lambda-l1/--lambda-l2` や `--feature-fraction` などの正則化パラメータを CLI から指定でき、成果物 (`training/browser/model/<timestamp>/lightgbm_model.txt`, `training_summary.json`) の保存までを一括で実行します。推論側で利用する正式ファイルは `models/browser/lightgbm_model.txt` へコピーしてください。optional フィールドが欠損しているレコードも Pydantic バリデーションを通して安全に処理されます。実行例:
    ```bash
    cd ai-detector
    uv sync --group train
    uv run python training/browser/train_lightgbm.py \
      --human-glob "training/browser/data/human/*.jsonl" \
      --bot-glob "training/browser/data/bot/*.jsonl" \
      --auto-scale-pos-weight \
      --valid-ratio 0.2
    ```

必要に応じて早見表のコマンドブロックをコピーしつつ `uv run python training/cluster/create_models.py` のように実行してください。

## 注意事項

- API の推論は `models/` ディレクトリの成果物を前提としています。モデルファイルがない場合はサーバー起動時にエラーになります。
- 追加の学習データやログは `data/raw/` 配下に保存し、必要に応じてドキュメントを更新してください。
