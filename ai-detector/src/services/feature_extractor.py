"""リクエストからLightGBM特徴量を抽出するロジック。"""

from __future__ import annotations

import logging
import math
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
        self._fill_counts_and_velocity(features, behavior_sequence, behavioral_data)
        self._fill_mouse_statistics(features, behavioral_data.mouse_movements)
        self._fill_sequence_statistics(features, behavior_sequence)
        self._fill_aggregated_metrics(features, request)
        self._fill_optional_flags(features, behavioral_data)
        self._fill_rate_features(features, behavioral_data)

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
                features["time_between_actions_std"] = float(np.std(time_diffs))
                features["time_between_actions_max"] = float(np.max(time_diffs))
                features["time_between_actions_min"] = float(np.min(time_diffs))
                std = features["time_between_actions_std"]
                mean = features["avg_time_between_actions"]
                features["time_between_actions_cv"] = float(std / mean) if mean else 0.0
        else:
            features["total_duration_ms"] = session_duration_ms
            features["time_between_actions_std"] = 0.0
            features["time_between_actions_max"] = 0.0
            features["time_between_actions_min"] = 0.0
            features["time_between_actions_cv"] = 0.0

    def _fill_counts_and_velocity(
        self,
        features: Dict[str, float],
        sequence: List[BehaviorEvent],
        behavioral_data,
    ) -> None:
        """アクション回数とマウス速度統計を算出する。"""
        mouse_movements = behavioral_data.mouse_movements
        action_counts = {
            "mouse_move": 0,
            "click": 0,
            "keystroke": 0,
            "scroll": 0,
            "idle": 0,
        }

        for event in sequence:
            if not event.action:
                continue
            action_lower = event.action.lower()
            if "mouse" in action_lower:
                action_counts["mouse_move"] += 1
            elif "click" in action_lower:
                action_counts["click"] += 1
            elif "key" in action_lower:
                action_counts["keystroke"] += 1
            elif "scroll" in action_lower:
                action_counts["scroll"] += 1
            elif "idle" in action_lower:
                action_counts["idle"] += 1

        if action_counts["mouse_move"] == 0 and mouse_movements:
            action_counts["mouse_move"] = len(mouse_movements)

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

    def _fill_mouse_statistics(self, features: Dict[str, float], mouse_movements: List[MouseMovement]) -> None:
        count = len(mouse_movements)
        features["mouse_event_count"] = float(count)
        features["mouse_activity_flag"] = 1.0 if count > 0 else 0.0

        if count >= 2:
            total_length = 0.0
            for prev, curr in zip(mouse_movements[:-1], mouse_movements[1:]):
                total_length += math.hypot(curr.x - prev.x, curr.y - prev.y)
            features["mouse_path_length"] = total_length
            features["mouse_duration_ms"] = float(mouse_movements[-1].timestamp - mouse_movements[0].timestamp)
        else:
            features["mouse_path_length"] = 0.0
            features["mouse_duration_ms"] = 0.0

        velocities = [movement.velocity for movement in mouse_movements if movement.velocity is not None]
        if velocities:
            features["mouse_velocity_median"] = float(np.median(velocities))
            stationary_ratio = sum(1 for v in velocities if abs(v) <= 0.05) / len(velocities)
            features["mouse_stationary_ratio"] = float(stationary_ratio)
        else:
            features["mouse_velocity_median"] = 0.0
            features["mouse_stationary_ratio"] = 0.0

    def _fill_sequence_statistics(self, features: Dict[str, float], sequence: List[BehaviorEvent]) -> None:
        count = len(sequence)
        features["sequence_event_count"] = float(count)
        if count:
            unique_actions = {event.action for event in sequence if event.action}
            features["sequence_unique_actions"] = float(len(unique_actions))
            action_counts = {}
            for event in sequence:
                if not event.action:
                    continue
                key = event.action.lower()
                action_counts[key] = action_counts.get(key, 0) + 1
            total_actions = sum(action_counts.values())
            if total_actions > 0:
                entropy = 0.0
                for value in action_counts.values():
                    p = value / total_actions
                    entropy -= p * math.log(p)
                features["action_entropy"] = entropy
            timed_actions = sum(1 for event in sequence if event.action and "timed" in event.action.lower())
            features["timed_action_ratio"] = float(timed_actions) / count
        else:
            features["sequence_unique_actions"] = 0.0
            features["action_entropy"] = 0.0
            features["timed_action_ratio"] = 0.0

        visibility_actions = {"visible", "hidden"}
        visibility_toggle = 0
        previous_state = None
        for event in sequence:
            action = (event.action or "").lower()
            if action in visibility_actions:
                if previous_state is not None and action != previous_state:
                    visibility_toggle += 1
                previous_state = action
        features["visibility_toggle_count"] = float(visibility_toggle)

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

        features["scroll_activity_flag"] = 1.0 if (scroll.scroll_speed or 0) > 0 else 0.0
        features["click_activity_flag"] = 1.0 if (click.click_precision or 0) > 0 else 0.0

        self._fill_device_fingerprint_features(features, request.device_fingerprint)

    def _fill_optional_flags(self, features: Dict[str, float], behavioral_data) -> None:
        page = behavioral_data.page_interaction
        features["page_first_interaction_missing"] = 1.0 if page.first_interaction_delay_ms is None else 0.0
        features["page_form_fill_missing"] = 1.0 if page.form_fill_speed_cpm is None else 0.0
        features["page_paste_ratio_missing"] = 1.0 if page.paste_ratio is None else 0.0
        features["first_interaction_delay_missing"] = features["page_first_interaction_missing"]

    def _fill_rate_features(self, features: Dict[str, float], behavioral_data) -> None:
        """各アクションを時間で正規化した特徴量を計算する。"""
        session_duration_ms = behavioral_data.page_interaction.session_duration_ms or 0.0
        duration_seconds = session_duration_ms / 1000.0 if session_duration_ms > 0 else 0.0

        def per_second(value: float) -> float:
            if duration_seconds <= 0:
                return 0.0
            return value / duration_seconds

        features["mouse_event_rate"] = per_second(features.get("mouse_event_count", 0.0))
        features["click_rate"] = per_second(features.get("action_count_click", 0.0))
        features["keystroke_rate"] = per_second(features.get("action_count_keystroke", 0.0))
        features["scroll_rate"] = per_second(features.get("action_count_scroll", 0.0))
        features["idle_rate"] = per_second(features.get("action_count_idle", 0.0))

        mouse_actions = features.get("action_count_mouse_move", 0.0)
        features["click_to_mouse_ratio"] = self._safe_ratio(
            features.get("action_count_click", 0.0), mouse_actions
        )
        features["scroll_to_mouse_ratio"] = self._safe_ratio(
            features.get("action_count_scroll", 0.0), mouse_actions
        )
        features["keystroke_to_mouse_ratio"] = self._safe_ratio(
            features.get("action_count_keystroke", 0.0), mouse_actions
        )

        mouse_path_length = features.get("mouse_path_length", 0.0)
        mouse_duration_ms = features.get("mouse_duration_ms", 0.0)
        features["mouse_avg_speed"] = (
            mouse_path_length / mouse_duration_ms if mouse_duration_ms > 0 else 0.0
        )
        features["mouse_path_rate"] = per_second(mouse_path_length)

    def _fill_device_fingerprint_features(self, features: Dict[str, float], device_fingerprint) -> None:
        """デバイス/ネットワーク由来の単純フラグを付与する。"""
        http_state = (device_fingerprint.http_signature_state or "missing").lower()
        features["fingerprint_http_signature_missing"] = 1.0 if http_state in {"missing", "unknown"} else 0.0

        tls_ja4 = device_fingerprint.tls_ja4
        features["fingerprint_tls_ja4_missing"] = 1.0 if not tls_ja4 or tls_ja4 == "unknown" else 0.0

        anti_fp_signals = device_fingerprint.anti_fingerprint_signals or []
        features["fingerprint_anti_fp_count"] = float(len(anti_fp_signals))
        suspicious_keys = {
            "navigator_webdriver_true",
            "headless_user_agent",
            "plugins_empty",
            "mobile_ua_no_touch",
            "languages_mismatch",
            "chrome_runtime_missing",
            "canvas_error",
            "webgl_error",
        }
        features["fingerprint_anti_fp_suspicious"] = (
            1.0 if any(signal in suspicious_keys for signal in anti_fp_signals) else 0.0
        )

    @staticmethod
    def _safe_ratio(numerator: float, denominator: float) -> float:
        if denominator and abs(denominator) > 0:
            return numerator / denominator
        return 0.0
