# ブラウザ ボット異常検知モデル レポート (20251125_155814)

## モデル概要
- アルゴリズム: IsolationForest（ボット分布を「正常」とみなすワン・クラス）  
- スコア: `combined_bot_score = (iso_bot_score + bot_similarity) / 2`  
  - iso_bot_score: IsolationForest の decision_function を学習スコア範囲で 0–1 正規化したもの（大きいほどボット寄り）  
  - bot_similarity: ボット分布の mean/std からの近さ（1 に近いほどボット分布に近い）  
  - human_score = 1 - combined_bot_score  
- 20 秒スライディングウインドウ後の特徴のみで判定。イベントが極端に少ないと confidence を 0.5 倍に抑制。

## IsolationForest 分割頻度 上位15
- page_session_duration_ms: 1734
- page_page_dwell_time_ms: 1683
- mouse_event_rate: 581
- click_rate: 537
- mouse_path_rate: 430
- page_form_fill_speed_cpm: 304
- avg_time_between_actions: 166
- total_duration_ms: 151
- mouse_stationary_ratio: 143
- action_entropy: 143
- mouse_path_length: 142
- action_count_click: 141
- mouse_avg_speed: 141
- mouse_duration_ms: 131
- sequence_event_count: 131

## 類似度計算に使う特徴 (bot 分布の基準値)
- velocity_mean: mean=0.0007, std=0.0131
- mouse_event_count: mean=5.0317, std=10.4406
- mouse_path_length: mean=15.4383, std=105.5392
- sequence_event_count: mean=8.5974, std=7.5055
- page_session_duration_ms: mean=4909.8831, std=7861.9360

## しきい値
- bot_threshold (iso_bot_score): 0.9351
- combined_threshold (combined_bot_score): 0.7640

## 補足
- bot_similarity は上記 mean/std に近いほど高くなる。  
- combined_threshold 以上で bot 判定。  
- human_score は 0–1 で大きいほど人寄り。
