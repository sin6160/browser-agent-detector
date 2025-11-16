# ai-detector API / モデル更新計画

## 目的
- `docs/browser-detection-data.md` の最新版フォーマットに `ai-detector` を追従させ、FastAPI が新しいブラウザ操作ログを受理・活用できるようにする。
- スキーマ、特徴量抽出、モデル入力、ロギングの各層でフィールド名/単位を揃え、`node-bridge` / `BehaviorTracker` との仕様乖離を解消する。

## 前提
- 後方互換は不要。旧フィールド名（例: `typing_speed`）は完全に置き換える。
- LightGBM モデルを再学習する予定がある場合でも、コード側は新しい特徴量キー 1:1 を前提に実装する。
- `browser-agent-sdk` 側は既に camelCase → snake_case 化して送信するため、FastAPI は snake_case 名をそのまま受ける。

## 改修項目

### 1. スキーマ (`ai-detector/src/schemas/detection.py`)
- `BehavioralKeystrokeDynamics`
  - `typing_speed_cpm`, `key_hold_time_ms`, `key_interval_variance` を必須フィールドとして定義し直す。
  - 旧フィールドは削除。後方互換不要。
- `BehavioralPageInteraction`
  - `session_duration_ms`, `page_dwell_time_ms`, `first_interaction_delay_ms`, `form_fill_speed_cpm`, `paste_ratio` へ置き換える。
  - `navigation_pattern` は仕様維持（必要なら Optional[str] のまま）。
- `BehavioralData`
  - `mouse_movements` は 1,000件以内に丸められるので型のみでOK（現行維持）。
- `BehaviorEvent`
  - `deltaX` / `deltaY` を snake_case で受信できるよう `delta_x`, `delta_y` に Field(alias=...) を設定し直す。
  - `button` など未使用フィールドはそのまま。
- `DeviceFingerprint`
  - 新規フィールド `http_signature_state`, `anti_fingerprint_signals`, `network_fingerprint_source`, `tls_ja4`, `http_signature` を Optional[str] / Optional[List[str]] で追加。
  - 後段で使用予定の `anti_fingerprint_signals` 等は default `None`。
- `UnifiedDetectionRequest`
  - `request_id` を追加 (`Field(None, alias="requestId")`)。必須化を検討（BehaviorTracker で常に送っているため必須指定でも良い）。
  - `behavior_sequence` フィールドの alias を `recent_actions` から `behavior_sequence` に揃えるか、`recent_actions` を alias に残したまま snake_case 受信を確認する。
  - `context` alias を `context` に統一（クライアントは snake_case）。

### 2. 特徴量抽出 (`ai-detector/src/services/feature_extractor.py`)
- `_fill_temporal_features`
  - 引数 `session_duration_seconds` をミリ秒にリネームし、`session_duration_ms` をそのまま利用。sequence が空の場合 `total_duration_ms = session_duration_ms`。
- `_fill_counts_and_velocity`
  - 型アノテーションを `List[MouseMovement]` に更新。ロジック自体は据え置き。
- `_fill_aggregated_metrics`
  - `behavioral_data` から取得するフィールド名を新仕様へ変更。
    - 例: `features["keystroke_typing_speed_cpm"] = keystroke.typing_speed_cpm`
    - `page_*` 系も `_ms` サフィックス付きに。
  - `features["page_paste_ratio"]` のような新特徴量キーを追加（モデルで使う場合のみ、必要数に合わせる）。旧 `page_form_fill_speed` → `page_form_fill_speed_cpm`。
  - 仕様で `paste_ratio` が追加されたため LightGBM に渡すキーを決める（例: `page_paste_ratio`）。モデルで使用しない場合は 0 で良いが基本的には追加。
  - `first_interaction_delay_ms` は `page.first_interaction_delay_ms` から取得。
- `is_mobile` 判定は現行維持。

### 3. LightGBM 入力 (`ai-detector/src/models/lightgbm_loader.py`)
- `DEFAULT_FEATURE_NAMES` を FeatureExtractor で出力するキー名と完全一致させる。
- 例:
  1. `total_duration_ms`
  2. `avg_time_between_actions`
  3. `velocity_mean`
  4. ...
  - keystroke群: `keystroke_typing_speed_cpm`, `keystroke_key_hold_time_ms`, `keystroke_key_interval_variance`
  - page群: `page_session_duration_ms`, `page_page_dwell_time_ms`, `page_first_interaction_delay_ms`, `page_form_fill_speed_cpm`, `page_paste_ratio`
- `first_interaction_delay_ms` が独立特徴量として必要ならリストに含める（重複に注意）。
- 必要に応じて特徴量数を 26→?? へ更新し、LightGBM モデルファイルの再エクスポート手順を別途用意。

### 4. 推論サービス (`ai-detector/src/services/detection_service.py`)
- `UnifiedDetectionRequest` に追加した `request_id` を使用。
  - 受信時に `request.request_id` を優先。未設定時のみ UUID 生成。
  - `DetectionResult.request_id` に保存し、レスポンス/ログがクライアント request_id と一致するようにする。

### 5. API ルート / ロギング
- `UnifiedDetectionResponse` には現行通り `request_id` を含むが、`DetectionResult` の `request_id` 変更により自然に反映される。
- `utils/training_logger.log_detection_sample`
  - 追加フィールド（特に `device_fingerprint.http_signature_state` と `recent_actions.delta_*`）が正しくシリアライズされるか確認。
  - UTF-8 のままで問題なし。

### 6. 追加検討 (任意)
- `FeatureExtractor` に `delta_x/delta_y` を使ったスクロール距離統計を追加するか検討。必要なら以下の追加特徴量を計画:
  - `scroll_total_delta_y`
  - `scroll_avg_delta_y`
  - `scroll_direction_changes`
- `BehaviorTracker` 側のリングバッファサイズや 1,000 イベント上限は仕様通り。サーバー側で再チェック不要。

## 実装手順案
1. **Schema 更新**
   - `detection.py` の該当モデルを書き換え → `uvicorn` 起動で Pydantic バリデーションを確認。
2. **FeatureExtractor & LightGBM feature list 更新**
   - ユニットテストがあれば修正。`DEFAULT_FEATURE_NAMES` と `extract()` のキー整合性をローカルで assert する。
3. **request_id パイプライン整備**
   - `DetectionService` / API レスポンス / ログで値を伝播。
4. **動作確認**
   - `tests/` 内のスキーマ・サービステストを更新し、`pytest` 実行。
   - `curl` で新仕様サンプルを POST し 200 応答を確認、ログ出力に新フィールドが載るかを確認。

## アウトプット
- スキーマファイルと FeatureExtractor / LightGBM 設定の改修 PR。
- 新仕様のサンプルリクエストを `docs/API-doc.md` に反映（必要なら別PR）。

