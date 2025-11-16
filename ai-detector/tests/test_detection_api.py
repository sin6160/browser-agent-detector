"""AIエージェント検知エンドポイントの基本テスト。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import app

DATA_DIR = Path(__file__).resolve().parent / "data"


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_root_endpoint(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    assert body["name"] == "AI Agent Detection API"


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["model_loaded"] is True
    assert body["cluster_model_loaded"] is True


def test_detect_endpoint_returns_prediction(client: TestClient) -> None:
    payload_path = DATA_DIR / "test_detection.json"
    with payload_path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)

    response = client.post("/detect", json=payload)
    assert response.status_code == 200
    body = response.json()

    assert body["session_id"] == payload["session_id"]
    assert body["request_id"] == payload["request_id"]
    browser = body["browser_detection"]
    assert 0 <= browser["score"] <= 1
    assert isinstance(browser["is_bot"], bool)
    assert 0 <= browser["confidence"] <= 1
    assert "features_extracted" in browser
    persona = body["persona_detection"]
    assert persona["is_provided"] in (True, False)
    decision = body["final_decision"]
    assert isinstance(decision["is_bot"], bool)
    assert decision["reason"] in {"persona_anomaly", "browser_behavior", "normal"}
