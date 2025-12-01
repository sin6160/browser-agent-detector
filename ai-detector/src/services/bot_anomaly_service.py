"""ボット正常モデル（IsolationForest）を使った人間らしさ推定サービス。"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Dict, List

import numpy as np

from models.browser_anomaly import BotAnomalyModel
from schemas.detection import BehaviorEvent, MouseMovement, UnifiedDetectionRequest
from services.feature_extractor import FeatureExtractor

logger = logging.getLogger(__name__)


@dataclass
class BotAnomalyResult:
    """異常検知ベースの判定結果。"""

    session_id: str
    score: float  # 人間らしさ (0=bot に近い, 1=human に近い)
    is_bot: bool
    confidence: float
    request_id: str
    features_extracted: Dict[str, float]
    raw_anomaly_score: float
    bot_score: float


class BotAnomalyDetectionService:
    """IsolationForest によるボット正常モデルとの距離判定。"""

    _SIMILARITY_FEATURES = [
        "velocity_mean",
        "mouse_event_count",
        "mouse_path_length",
        "sequence_event_count",
        "page_session_duration_ms",
    ]

    def __init__(self, model: BotAnomalyModel, extractor: FeatureExtractor):
        self._model = model
        self._extractor = extractor

    @staticmethod
    def _apply_recent_window(
        request: UnifiedDetectionRequest, window_ms: int = 20_000
    ) -> tuple[UnifiedDetectionRequest, int, int]:
        """最新イベントから window_ms だけ遡ったデータに絞る。"""
        seq: List[BehaviorEvent] = request.behavior_sequence or []
        mouse: List[MouseMovement] = request.behavioral_data.mouse_movements or []

        if not seq and not mouse:
            return request, 0, 0

        latest_ts = max(
            ([event.timestamp for event in seq] if seq else [])
            + ([m.timestamp for m in mouse] if mouse else [])
        )
        cutoff = latest_ts - window_ms

        filtered_seq = [event for event in seq if event.timestamp >= cutoff]
        filtered_mouse = [m for m in mouse if m.timestamp >= cutoff]

        if len(filtered_seq) == len(seq) and len(filtered_mouse) == len(mouse):
            return request, len(seq), len(mouse)

        behavioral_data = request.behavioral_data.model_copy(update={"mouse_movements": filtered_mouse})
        filtered_request = request.model_copy(
            update={
                "behavior_sequence": filtered_seq,
                "behavioral_data": behavioral_data,
            }
        )
        logger.debug(
            "20s window applied: seq %s->%s mouse %s->%s (cutoff=%s)",
            len(seq),
            len(filtered_seq),
            len(mouse),
            len(filtered_mouse),
            cutoff,
        )
        return filtered_request, len(filtered_seq), len(filtered_mouse)

    def predict(self, request: UnifiedDetectionRequest) -> BotAnomalyResult:
        filtered_request, seq_len, mouse_len = self._apply_recent_window(request)

        features = self._extractor.extract(filtered_request)
        feature_array = np.array(
            [features[name] for name in self._model.feature_names], dtype=float
        ).reshape(1, -1)

        scaled = self._model.scaler.transform(feature_array)
        raw_score = float(self._model.isolation_forest.decision_function(scaled)[0])

        # decision_function は大きいほど正常(=botに近い)。学習スコアの min/max で正規化し bot_score とする。
        denom = self._model.score_max - self._model.score_min
        if denom <= 0:
            bot_score = 0.0
        else:
            bot_score = (raw_score - self._model.score_min) / denom
            bot_score = float(np.clip(bot_score, 0.0, 1.0))

        similarity = self._compute_bot_similarity(features)

        combined_bot_score = (bot_score + similarity) / 2.0

        human_score = 1.0 - combined_bot_score
        is_bot = combined_bot_score >= self._model.combined_threshold
        confidence = abs(human_score - (1.0 - self._model.combined_threshold)) * 2

        # データが乏しい場合は信頼度を抑制する
        if seq_len < 3 and mouse_len < 5:
            confidence *= 0.5

        session_id = request.session_id or str(uuid.uuid4())
        request_id = request.request_id or str(uuid.uuid4())

        logger.info(
            "IsolationForest human_score=%.4f bot_score=%.4f raw=%.4f similarity=%.4f threshold(bot)=%.4f",
            human_score,
            combined_bot_score,
            raw_score,
            similarity,
            self._model.combined_threshold,
        )

        return BotAnomalyResult(
            session_id=session_id,
            score=human_score,
            is_bot=is_bot,
            confidence=confidence,
            request_id=request_id,
            features_extracted=features,
            raw_anomaly_score=raw_score,
            bot_score=combined_bot_score,
        )

    def _compute_bot_similarity(self, features: Dict[str, float]) -> float:
        """ボット学習データの統計からの近さ (0-1) を算出。"""
        mean = self._model.feature_stats.get("mean", {})
        std = self._model.feature_stats.get("std", {})

        zs = []
        for key in self._SIMILARITY_FEATURES:
            if key not in features or key not in mean or key not in std:
                continue
            sigma = std[key]
            if sigma <= 0:
                continue
            z = abs((features[key] - mean[key]) / sigma)
            zs.append(z)

        if not zs:
            return 0.5

        avg_z = float(np.mean(zs))
        similarity = float(1.0 / (1.0 + avg_z))
        return similarity
