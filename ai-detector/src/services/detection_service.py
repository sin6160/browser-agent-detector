"""AIエージェント検知推論サービス。"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Dict

import numpy as np

from models.lightgbm_loader import LightGBMModel
from schemas.detection import UnifiedDetectionRequest
from services.feature_extractor import FeatureExtractor

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """推論結果。"""

    session_id: str
    score: float
    is_bot: bool
    confidence: float
    request_id: str
    features_extracted: Dict[str, float]
    raw_prediction: float


class DetectionService:
    """LightGBMモデルを使用した推論サービス。"""

    def __init__(self, model: LightGBMModel, extractor: FeatureExtractor):
        self._model = model
        self._extractor = extractor

    def predict(self, request: UnifiedDetectionRequest) -> DetectionResult:
        """リクエストを受け取り推論を実行。"""

        features = self._extractor.extract(request)
        feature_array = np.array(
            [features[name] for name in self._model.feature_names], dtype=float
        ).reshape(1, -1)

        bot_probability = float(self._model.booster.predict(feature_array)[0])
        logger.info("LightGBM予測確率(bot): %s", bot_probability)

        score = 1.0 - bot_probability  # 人間らしさスコア
        is_bot = score < 0.5
        confidence = abs(score - 0.5) * 2

        session_id = request.session_id or str(uuid.uuid4())
        request_id = request.request_id or str(uuid.uuid4())

        return DetectionResult(
            session_id=session_id,
            score=score,
            is_bot=is_bot,
            confidence=confidence,
            request_id=request_id,
            features_extracted=features,
            raw_prediction=bot_probability,
        )
