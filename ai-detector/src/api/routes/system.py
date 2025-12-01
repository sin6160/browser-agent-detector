"""システム関連エンドポイント。"""

from __future__ import annotations

import time

from fastapi import APIRouter

from api.dependencies import get_bot_anomaly_model, get_cluster_detector

router = APIRouter()


@router.get("/")
async def root() -> dict[str, str]:
    """ルートエンドポイント。"""
    return {
        "name": "AI Agent Detection API",
        "version": "1.0.0",
        "status": "running",
    }


@router.get("/health")
async def health_check() -> dict[str, object]:
    """ヘルスチェックエンドポイント。"""
    anomaly_loaded = False
    cluster_loaded = False

    try:
        get_bot_anomaly_model()
        anomaly_loaded = True
    except Exception:
        anomaly_loaded = False

    try:
        get_cluster_detector()
        cluster_loaded = True
    except Exception:
        cluster_loaded = False

    return {
        "status": "healthy" if anomaly_loaded and cluster_loaded else "degraded",
        "browser_anomaly_loaded": anomaly_loaded,
        "cluster_model_loaded": cluster_loaded,
        "timestamp": int(time.time() * 1000),
    }
