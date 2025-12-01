"""FastAPI アプリケーションエントリポイント。"""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import dependencies
from api.routes import cluster, detection, system
from utils.logging import setup_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションライフサイクル管理。"""
    setup_logging()
    logger.info("アプリケーション起動中: モデルを読み込みます")

    try:
        dependencies.get_bot_anomaly_model()
        dependencies.get_cluster_detector()
        logger.info("すべてのモデル読み込みが完了しました")
    except Exception as exc:  # pragma: no cover - 起動時エラー
        logger.exception("起動時のモデル初期化でエラーが発生しました: %s", exc)
        raise

    yield
    logger.info("アプリケーションをシャットダウンします")


app = FastAPI(
    title="AI Agent Detection API",
    description="Detect AI agents using behavioral data",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(detection.router)
app.include_router(cluster.router)
