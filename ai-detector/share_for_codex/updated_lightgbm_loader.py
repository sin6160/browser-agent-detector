"""LightGBM モデルの読み込みユーティリティ。"""

from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any, Iterable, List

import lightgbm as lgb

import config

logger = logging.getLogger(__name__)


DEFAULT_FEATURE_NAMES: List[str] = [
    "total_duration_ms",
    "first_interaction_delay_ms",
    "avg_time_between_actions",
    "velocity_mean",
    "velocity_max",
    "velocity_std",
    "action_count_mouse_move",
    "action_count_click",
    "action_count_keystroke",
    "action_count_scroll",
    "action_count_idle",
    "is_mobile",
    "click_avg_click_interval",
    "click_click_precision",
    "click_double_click_rate",
    "keystroke_typing_speed_cpm",
    "keystroke_key_hold_time_ms",
    "keystroke_key_interval_variance",
    "scroll_speed",
    "scroll_acceleration",
    "pause_frequency",
    "page_session_duration_ms",
    "page_page_dwell_time_ms",
    "page_first_interaction_delay_ms",
    "page_form_fill_speed_cpm",
    "page_paste_ratio",
    "mouse_event_count",
    "mouse_path_length",
    "mouse_velocity_median",
    "mouse_stationary_ratio",
    "mouse_duration_ms",
    "sequence_event_count",
    "sequence_unique_actions",
    "visibility_toggle_count",
    "timed_action_ratio",
    "page_first_interaction_missing",
    "page_form_fill_missing",
    "page_paste_ratio_missing",
    "first_interaction_delay_missing",
    "mouse_activity_flag",
    "scroll_activity_flag",
    "click_activity_flag",
]


class LightGBMModelDisabledError(RuntimeError):
    """環境変数でブラウザモデルが無効化されている場合の例外。"""


class _DisabledBooster:
    """モデル無効化時に使用するダミーBooster。"""

    def predict(self, data: Any) -> List[float]:
        raise LightGBMModelDisabledError(
            "LightGBM browser model is disabled via AI_DETECTOR_DISABLE_BROWSER_MODEL"
        )


@dataclass(frozen=True)
class LightGBMModel:
    """LightGBM Booster と特徴量名のセット。"""

    booster: Any
    feature_names: Iterable[str]


def load_lightgbm_model(model_path: Path | None = None) -> LightGBMModel:
    """LightGBM モデルファイルを読み込み、Booster を返す。"""

    if config.BROWSER_MODEL_DISABLED:
        logger.warning("LightGBMブラウザモデルを無効化します (AI_DETECTOR_DISABLE_BROWSER_MODEL=1)")
        return LightGBMModel(booster=_DisabledBooster(), feature_names=DEFAULT_FEATURE_NAMES)

    resolved_path = model_path or config.LIGHTGBM_MODEL_PATH
    if not resolved_path.exists():
        raise FileNotFoundError(f"LightGBMモデルファイルが見つかりません: {resolved_path}")

    try:
        booster = lgb.Booster(model_file=str(resolved_path))
    except Exception as exc:  # pragma: no cover - LightGBM内部例外のラップ
        logger.error("LightGBMモデルの読み込みに失敗しました: %s", exc)
        raise

    logger.info("LightGBMモデルを読み込みました: %s", resolved_path)
    return LightGBMModel(booster=booster, feature_names=DEFAULT_FEATURE_NAMES)
