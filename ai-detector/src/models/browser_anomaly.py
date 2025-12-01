"""ブラウザ行動のボット正常モデルを用いた異常検知ローダー。"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable

import joblib

import config

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BotAnomalyModel:
    """IsolationForest ベースのボット正常モデル。"""

    isolation_forest: Any
    scaler: Any
    feature_names: Iterable[str]
    score_min: float
    score_max: float
    bot_threshold: float
    combined_threshold: float
    feature_stats: Dict[str, Dict[str, float]]
    metadata: Dict[str, Any]


def load_bot_anomaly_model(model_path: Path | None = None) -> BotAnomalyModel:
    """ボット正常モデルを読み込む。"""

    resolved = model_path or config.BROWSER_ANOMALY_MODEL_PATH
    resolved = Path(resolved)
    if not resolved.exists():
        raise FileNotFoundError(f"ブラウザ異常検知モデルが見つかりません: {resolved}")

    payload = joblib.load(resolved)
    required_keys = {"isolation_forest", "scaler", "feature_names", "score_min", "score_max", "bot_threshold"}
    missing = required_keys - payload.keys()
    if missing:
        raise ValueError(f"モデルファイルに必要なキーが欠落しています: {missing}")

    logger.info("ボット異常検知モデルを読み込みました: %s", resolved)

    return BotAnomalyModel(
        isolation_forest=payload["isolation_forest"],
        scaler=payload["scaler"],
        feature_names=payload["feature_names"],
        score_min=float(payload["score_min"]),
        score_max=float(payload["score_max"]),
        bot_threshold=float(payload["bot_threshold"]),
        combined_threshold=float(payload.get("combined_threshold", payload["bot_threshold"])),
        feature_stats=payload.get("feature_stats", {"mean": {}, "std": {}}),
        metadata=payload.get("metadata", {}),
    )
