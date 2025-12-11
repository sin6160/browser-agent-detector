"""クラスタ異常検知エンドポイントの基本テスト。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.app import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_cluster_anomaly_detection_basic_case(client: TestClient) -> None:
    payload = {
        "age": 65,
        "gender": 2,
        "prefecture": 13,
        "product_category": 1,
        "quantity": 2,
        "price": 5000,
        "total_amount": 10000,
        "purchase_time": 14,
        "limited_flag": 0,
        "payment_method": 3,
        "manufacturer": 5,
    }

    response = client.post("/detect_cluster_anomaly", json=payload)
    assert response.status_code == 200
    body = response.json()

    assert body["cluster_id"] in {0, 1, 2, 3}
    assert body["prediction"] in {1, -1}
    assert isinstance(body["is_anomaly"], bool)
    assert "anomaly_score" in body
    assert "threshold" in body
    assert "request_id" in body


def test_cluster_anomaly_normal_scenario_should_be_safe(client: TestClient) -> None:
    """学習データに近い（若年女性×ゲーム系）シナリオは正常を期待。"""
    payload = {
        "age": 28,
        "gender": 2,
        "prefecture": 14,
        "product_category": 10,  # ゲーム
        "quantity": 1,
        "price": 7000,
        "total_amount": 7000,
        "purchase_time": 20,
        "limited_flag": 0,
        "payment_method": 3,
        "manufacturer": 10,
        "pc1": 0.7,
        "pc2": 0.8,
    }
    response = client.post("/detect_cluster_anomaly", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["is_anomaly"] is False
    assert body["prediction"] == 1


def test_cluster_anomaly_extreme_giftcard_should_be_flagged(client: TestClient) -> None:
    """シニア女性×ギフト券×極端な金額は異常判定を期待。"""
    payload = {
        "age": 65,
        "gender": 2,
        "prefecture": 27,
        "product_category": 11,  # ギフト券
        "quantity": 5,
        "price": 1_000_000,
        "total_amount": 5_000_000,
        "purchase_time": 3,
        "limited_flag": 0,
        "payment_method": 3,
        "manufacturer": 1,
        "pc1": 0.9,
        "pc2": 0.9,
    }
    response = client.post("/detect_cluster_anomaly", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["is_anomaly"] is True
    assert body["prediction"] == -1


def test_cluster_anomaly_giftcard_single_should_be_flagged(client: TestClient) -> None:
    """シニア女性×ギフト券×1枚のパターンも異常として捉える。"""
    payload = {
        "age": 65,
        "gender": 2,
        "prefecture": 27,
        "product_category": 11,  # ギフト券
        "quantity": 1,
        "price": 5000,
        "total_amount": 5000,
        "purchase_time": 10,
        "limited_flag": 0,
        "payment_method": 3,
        "manufacturer": 2,
        "pc1": 0.9,
        "pc2": 0.9,
    }
    response = client.post("/detect_cluster_anomaly", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["is_anomaly"] is True
    assert body["prediction"] == -1
