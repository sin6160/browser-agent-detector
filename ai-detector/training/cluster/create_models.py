#!/usr/bin/env python3
"""
クラスタ異常検知モデル作成スクリプト v2
scikit-learn 1.7.1で確実に新しいモデルを作成
"""

import json
import logging
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# パス定義
BASE_DIR = Path(__file__).resolve().parents[2]
DATA_PATH = BASE_DIR / "training" / "cluster" / "data" / "ecommerce_clustering_data.csv"
OUTPUT_DIR = BASE_DIR / "models" / "persona"
PURCHASE_FEATURES = [
    "age",
    "gender",
    "prefecture",
    "product_category",
    "quantity",
    "price",
    "total_amount",
    "purchase_time",
    "limited_flag",
    "payment_method",
    "manufacturer",
    "pc1",
    "pc2",
]

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def verify_sklearn_version():
    """scikit-learnのバージョンを確認"""
    version = sklearn.__version__
    logger.info(f"使用中のscikit-learnバージョン: {version}")
    if version != "1.7.1":
        logger.warning(f"期待されるバージョン: 1.7.1, 実際のバージョン: {version}")
    return version

def load_data():
    """データを読み込み"""
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"データファイルが見つかりません: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    logger.info(f"データを読み込みました: {len(df)}件")
    logger.info(f"データの列: {list(df.columns)}")
    return df

def create_kmeans_model(df):
    """KMeansモデルを作成"""
    # クラスタリング用の特徴量（年齢、性別、都道府県）
    cluster_features = df[['age', 'gender', 'prefecture']].values

    # KMeansモデルを作成（4クラスタに戻す）
    kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
    kmeans.fit(cluster_features)

    logger.info(f"KMeansモデルを作成しました: {kmeans.n_clusters}クラスタ")
    return kmeans

def create_isolation_forest_models(df, kmeans):
    """各クラスタ用のIsolationForestモデルを作成"""
    # クラスタIDを予測
    cluster_features = df[['age', 'gender', 'prefecture']].values
    cluster_labels = kmeans.predict(cluster_features)
    df['cluster_id'] = cluster_labels

    cluster_models = {}

    for cluster_id in range(4):  # 4クラスタに戻す
        cluster_data = df[df['cluster_id'] == cluster_id]

        if len(cluster_data) < 5:  # データが少なすぎる場合はスキップ
            logger.warning(f"クラスタ {cluster_id} のデータが少なすぎます: {len(cluster_data)}件")
            continue

        # 購入データを取得
        X = cluster_data[PURCHASE_FEATURES].values

        # 標準化
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # IsolationForestモデルを作成
        isolation_forest = IsolationForest(
            contamination=0.15,  # 異常寄りに傾けて境界を厳しめに
            random_state=42,
            n_estimators=200
        )
        isolation_forest.fit(X_scaled)

        # 閾値を計算（decision_functionの20%分位点でやや厳しめ）
        scores = isolation_forest.decision_function(X_scaled)
        threshold = np.percentile(scores, 20)

        cluster_models[cluster_id] = {
            'scaler': scaler,
            'isolation_forest': isolation_forest,
            'threshold': threshold,
            'seen_categories': sorted(cluster_data["product_category"].unique().tolist()),
        }

        logger.info(f"クラスタ {cluster_id} のモデルを作成しました: {len(cluster_data)}件, 閾値={threshold:.6f}")

    return cluster_models

def create_metadata(kmeans, cluster_models, sklearn_version):
    """メタデータを作成"""
    metadata = {
        "kmeans": {
            "n_clusters": kmeans.n_clusters,
            "n_features_in_": kmeans.n_features_in_,
            "random_state": kmeans.random_state
        },
        "cluster_models": {},
        "created_with": f"scikit-learn {sklearn_version}",
        "python_version": "3.13",
        "created_at": datetime.now().isoformat(),
        "note": "KMeansモデルは4クラスタ、異常検知モデルは各クラスタごとに作成"
    }

    for cluster_id, model_data in cluster_models.items():
        metadata["cluster_models"][str(cluster_id)] = {
            "n_features_in_": len(PURCHASE_FEATURES),
            "threshold": float(model_data['threshold']),
            "has_model": True,
            "seen_categories": model_data.get("seen_categories", []),
        }

    return metadata

def save_models(kmeans, cluster_models, metadata):
    """モデルとメタデータを保存"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # KMeansモデルを保存
    kmeans_path = OUTPUT_DIR / "kmeans_model.pkl"
    joblib.dump(kmeans, kmeans_path)
    logger.info(f"KMeansモデルを保存しました: {kmeans_path}")

    # クラスタ異常検知モデルを保存
    cluster_models_path = OUTPUT_DIR / "cluster_isolation_models.pkl"
    joblib.dump(cluster_models, cluster_models_path)
    logger.info(f"クラスタ異常検知モデルを保存しました: {cluster_models_path}")

    # メタデータを保存
    metadata_path = OUTPUT_DIR / "model_metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    logger.info(f"メタデータを保存しました: {metadata_path}")

def verify_models():
    """作成したモデルを検証"""
    try:
        # モデルを読み込んで検証
        kmeans = joblib.load(OUTPUT_DIR / "kmeans_model.pkl")
        cluster_models = joblib.load(OUTPUT_DIR / "cluster_isolation_models.pkl")

        logger.info("=== モデル検証 ===")
        logger.info(f"KMeans: {kmeans.n_clusters}クラスタ")
        logger.info(f"Cluster models: {len(cluster_models)}個")

        for cluster_id, model_data in cluster_models.items():
            logger.info(f"  Cluster {cluster_id}: {type(model_data['isolation_forest'])}")

        logger.info("モデル検証完了")
        return True

    except Exception as e:
        logger.error(f"モデル検証エラー: {e}")
        return False

def main():
    """メイン処理"""
    try:
        # scikit-learnのバージョンを確認
        sklearn_version = verify_sklearn_version()

        # データを読み込み
        df = load_data()

        # KMeansモデルを作成
        kmeans = create_kmeans_model(df)

        # 各クラスタ用のIsolationForestモデルを作成
        cluster_models = create_isolation_forest_models(df, kmeans)

        # メタデータを作成
        metadata = create_metadata(kmeans, cluster_models, sklearn_version)

        # モデルとメタデータを保存
        save_models(kmeans, cluster_models, metadata)

        # モデルを検証
        if verify_models():
            logger.info("モデル作成が完了しました")
        else:
            logger.error("モデル検証に失敗しました")
            raise Exception("モデル検証失敗")

    except Exception as e:
        logger.error(f"モデル作成エラー: {e}")
        raise

if __name__ == "__main__":
    main()
