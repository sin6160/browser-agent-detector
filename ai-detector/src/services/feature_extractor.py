"""リクエストからLightGBM特徴量を抽出するロジック。"""

from __future__ import annotations

import logging
from typing import Dict, Iterable, List

import numpy as np

from schemas.detection import BehaviorEvent, MouseMovement, UnifiedDetectionRequest

logger = logging.getLogger(__name__)


class FeatureExtractor:
    """ブラウザ行動データをLightGBM特徴量に変換する。"""

    def __init__(self, feature_names: Iterable[str]):
        self.feature_names = list(feature_names)

    def _initialize_features(self) -> Dict[str, float]:
        return {name: 0.0 for name in self.feature_names}

    def extract(self, request: UnifiedDetectionRequest) -> Dict[str, float]:
        """統合リクエストから特徴量辞書を生成する。"""

        features = self._initialize_features()

        behavior_sequence = request.behavior_sequence or []
        behavioral_data = request.behavioral_data

        logger.info(
            "特徴量抽出: behavior_sequence=%s, persona_provided=%s",
            len(behavior_sequence),
            bool(request.persona_features),
        )

        self._fill_temporal_features(
            features, behavior_sequence, behavioral_data.page_interaction.session_duration_ms
        )
        self._fill_counts_and_velocity(features, behavior_sequence, behavioral_data.mouse_movements)
        self._fill_aggregated_metrics(features, request)

        return features

    def _fill_temporal_features(
        self,
        features: Dict[str, float],
        sequence: List[BehaviorEvent],
        session_duration_ms: float,
    ) -> None:
        """時間関連の統計量を設定する。"""
        if sequence:
            timestamps = [event.timestamp for event in sequence]
            features["total_duration_ms"] = max(timestamps) - min(timestamps)

            time_diffs = [
                timestamps[i + 1] - timestamps[i]
                for i in range(len(timestamps) - 1)
                if timestamps[i + 1] >= timestamps[i]
            ]
            if time_diffs:
                features["avg_time_between_actions"] = float(np.mean(time_diffs))
        else:
            features["total_duration_ms"] = session_duration_ms

    def _fill_counts_and_velocity(
        self,
        features: Dict[str, float],
        sequence: List[BehaviorEvent],
        mouse_movements: List[MouseMovement],
    ) -> None:
        """アクション回数とマウス速度統計を算出する。"""
        action_counts = {
            "mouse_move": 0,
            "click": 0,
            "keystroke": 0,
            "scroll": 0,
            "idle": 0,
        }

        for event in sequence:
            if event.action in action_counts:
                action_counts[event.action] += 1

        features["action_count_mouse_move"] = action_counts["mouse_move"]
        features["action_count_click"] = action_counts["click"]
        features["action_count_keystroke"] = action_counts["keystroke"]
        features["action_count_scroll"] = action_counts["scroll"]
        features["action_count_idle"] = action_counts["idle"]

        velocities = [movement.velocity for movement in mouse_movements if movement.velocity is not None]
        if velocities:
            features["velocity_mean"] = float(np.mean(velocities))
            features["velocity_max"] = float(np.max(velocities))
            features["velocity_std"] = float(np.std(velocities, ddof=0))

    def _fill_aggregated_metrics(self, features: Dict[str, float], request: UnifiedDetectionRequest) -> None:
        """BehaviorTracker が計算した集計値を特徴量へマッピングする。"""
        behavioral_data = request.behavioral_data
        page = behavioral_data.page_interaction
        click = behavioral_data.click_patterns
        keystroke = behavioral_data.keystroke_dynamics
        scroll = behavioral_data.scroll_behavior

        features["click_avg_click_interval"] = click.avg_click_interval
        features["click_click_precision"] = click.click_precision
        features["click_double_click_rate"] = click.double_click_rate

        features["keystroke_typing_speed_cpm"] = keystroke.typing_speed_cpm
        features["keystroke_key_hold_time_ms"] = keystroke.key_hold_time_ms
        features["keystroke_key_interval_variance"] = keystroke.key_interval_variance

        features["scroll_speed"] = scroll.scroll_speed
        features["scroll_acceleration"] = scroll.scroll_acceleration
        features["pause_frequency"] = scroll.pause_frequency

        features["page_session_duration_ms"] = page.session_duration_ms
        features["page_page_dwell_time_ms"] = page.page_dwell_time_ms
        features["page_first_interaction_delay_ms"] = page.first_interaction_delay_ms or 0.0
        features["page_form_fill_speed_cpm"] = page.form_fill_speed_cpm or 0.0
        features["page_paste_ratio"] = page.paste_ratio or 0.0

        features["first_interaction_delay_ms"] = page.first_interaction_delay_ms or 0.0

        # デバイス情報からモバイル判定
        user_agent = request.device_fingerprint.user_agent.lower()
        features["is_mobile"] = 1 if "mobile" in user_agent else 0
