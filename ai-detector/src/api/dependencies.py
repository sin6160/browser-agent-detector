"""FastAPI で利用する依存関係定義。"""

from __future__ import annotations

from functools import lru_cache

from models.browser_anomaly import BotAnomalyModel, load_bot_anomaly_model
from models.cluster_detector import ClusterAnomalyDetector
from models.lightgbm_loader import DEFAULT_FEATURE_NAMES
from services.bot_anomaly_service import BotAnomalyDetectionService
from services.cluster_service import ClusterDetectionService
from services.feature_extractor import FeatureExtractor


@lru_cache
def get_feature_extractor() -> FeatureExtractor:
    """特徴量抽出器のシングルトン取得。"""
    return FeatureExtractor(DEFAULT_FEATURE_NAMES)


@lru_cache
def get_bot_anomaly_model() -> BotAnomalyModel:
    """IsolationForest 異常検知モデルのシングルトン取得。"""
    return load_bot_anomaly_model()


@lru_cache
def get_bot_anomaly_service() -> BotAnomalyDetectionService:
    """異常検知サービスのシングルトン取得。"""
    return BotAnomalyDetectionService(get_bot_anomaly_model(), get_feature_extractor())


@lru_cache
def get_detection_service() -> BotAnomalyDetectionService:
    """後方互換の検知サービス取得 (異常検知版)。"""
    return get_bot_anomaly_service()


@lru_cache
def get_cluster_detector() -> ClusterAnomalyDetector:
    """クラスタ異常検知モデルのシングルトン取得。"""
    detector = ClusterAnomalyDetector()
    detector.load_models()
    return detector


@lru_cache
def get_cluster_service() -> ClusterDetectionService:
    """クラスタ異常検知サービスのシングルトン取得。"""
    return ClusterDetectionService(get_cluster_detector())
