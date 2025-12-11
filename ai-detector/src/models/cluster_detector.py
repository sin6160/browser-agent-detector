"""クラスタ異常検知モデルのローダー。"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, Tuple

import joblib
import numpy as np

import config

logger = logging.getLogger(__name__)


class ClusterAnomalyDetector:
    """KMeans と IsolationForest を組み合わせた異常検知器。"""

    def __init__(self, models_dir: Path | None = None):
        self.models_dir = models_dir or config.CLUSTER_MODELS_DIR
        self.kmeans_model = None
        self.cluster_models = None
        self.metadata: Dict[str, Any] | None = None
        self.logger = logging.getLogger(__name__)

    def load_models(self) -> None:
        """モデルファイルを読み込む。"""

        models_dir = Path(self.models_dir)
        kmeans_path = models_dir / "kmeans_model.pkl"
        cluster_models_path = models_dir / "cluster_isolation_models.pkl"
        metadata_path = models_dir / "model_metadata.json"

        if not kmeans_path.exists():
            raise FileNotFoundError(f"KMeansモデルファイルが見つかりません: {kmeans_path}")
        if not cluster_models_path.exists():
            raise FileNotFoundError(
                f"クラスタ異常検知モデルファイルが見つかりません: {cluster_models_path}"
            )

        self.kmeans_model = joblib.load(kmeans_path)
        self.logger.info("KMeansモデルを読み込みました")

        self.cluster_models = joblib.load(cluster_models_path)
        self.logger.info("クラスタ異常検知モデルを読み込みました")

        if metadata_path.exists():
            with open(metadata_path, "r", encoding="utf-8") as fh:
                self.metadata = json.load(fh)
            self.logger.info("モデルメタデータを読み込みました")
        else:
            self.logger.warning("メタデータファイルが見つかりません: %s", metadata_path)

    def predict_cluster(self, age: int, gender: int, prefecture: int) -> int:
        """クラスタIDを予測する。"""
        if self.kmeans_model is None:
            raise ValueError("KMeansモデルが読み込まれていません")

        input_data = np.array([[age, gender, prefecture]])
        cluster_id = int(self.kmeans_model.predict(input_data)[0])
        self.logger.info(
            "クラスタ予測: age=%s gender=%s prefecture=%s -> cluster_id=%s",
            age,
            gender,
            prefecture,
            cluster_id,
        )
        return cluster_id

    def detect_anomaly(self, cluster_id: int, purchase_data: Tuple[float, ...]) -> Tuple[int, float, float]:
        """IsolationForestで異常を判定。"""
        if self.cluster_models is None:
            raise ValueError("クラスタ異常検知モデルが読み込まれていません")
        if cluster_id not in self.cluster_models:
            raise ValueError(f"クラスタID {cluster_id} に対応するモデルが見つかりません")

        cluster_model = self.cluster_models[cluster_id]
        scaler = cluster_model["scaler"]
        isolation_forest = cluster_model["isolation_forest"]

        expected_features = getattr(scaler, "n_features_in_", len(purchase_data))
        vector = list(purchase_data)
        if len(vector) > expected_features:
            vector = vector[:expected_features]
        elif len(vector) < expected_features:
            vector.extend([0.0] * (expected_features - len(vector)))

        purchase_array = np.array([vector])
        scaled_data = scaler.transform(purchase_array)

        prediction = int(isolation_forest.predict(scaled_data)[0])
        anomaly_score = float(isolation_forest.decision_function(scaled_data)[0])

        threshold = 0.0
        if self.metadata and "cluster_models" in self.metadata:
            threshold = float(
                self.metadata["cluster_models"].get(str(cluster_id), {}).get("threshold", 0.0)
            )

        is_anomaly = anomaly_score < threshold
        self.logger.info(
            "異常検知: cluster_id=%s prediction=%s score=%.4f threshold=%.4f is_anomaly=%s",
            cluster_id,
            prediction,
            anomaly_score,
            threshold,
            is_anomaly,
        )

        return prediction, anomaly_score, threshold

    def predict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """クラスタ予測と異常検知の全体処理。"""
        try:
            age = data["age"]
            gender = data["gender"]
            prefecture = data["prefecture"]

            purchase_data = (
                data["product_category"],
                data["quantity"],
                data["price"],
                data["total_amount"],
                data["purchase_time"],
                data["limited_flag"],
                data["payment_method"],
                data["manufacturer"],
                data.get("pc1", 0.0) or 0.0,
                data.get("pc2", 0.0) or 0.0,
            )

            cluster_id = self.predict_cluster(age, gender, prefecture)
            prediction, anomaly_score, threshold = self.detect_anomaly(cluster_id, purchase_data)

            return {
                "cluster_id": cluster_id,
                "prediction": prediction,
                "anomaly_score": anomaly_score,
                "threshold": threshold,
                "is_anomaly": prediction == -1,
            }
        except Exception as exc:
            self.logger.error("クラスタ異常検知処理でエラーが発生: %s", exc)
            raise
