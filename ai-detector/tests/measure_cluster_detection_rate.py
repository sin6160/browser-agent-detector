#!/usr/bin/env python3
"""クラスタ異常検知の混同行列を出力するワンショットスクリプト & 簡易テスト。"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import config
from models.cluster_detector import ClusterAnomalyDetector
from schemas.cluster import ClusterAnomalyRequest
from services.cluster_service import ClusterDetectionResult, ClusterDetectionService

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
NORMAL_PATH = DATA_DIR / "cluster_detection_normal.csv"
ANOMALY_PATH = DATA_DIR / "cluster_detection_anomaly.csv"


@dataclass
class Confusion:
    tp: int = 0
    fp: int = 0
    tn: int = 0
    fn: int = 0

    @property
    def total(self) -> int:
        return self.tp + self.fp + self.tn + self.fn


def load_cases(path: Path, expected_is_anomaly: bool) -> List[tuple[ClusterAnomalyRequest, bool]]:
    with path.open() as f:
        reader = csv.DictReader(f)
        cases: List[tuple[ClusterAnomalyRequest, bool]] = []
        for row in reader:
            payload = {k: int(v) if k not in {"pc1", "pc2"} else float(v) for k, v in row.items()}
            cases.append((ClusterAnomalyRequest(**payload), expected_is_anomaly))
        return cases


def evaluate(service: ClusterDetectionService, cases: Iterable[tuple[ClusterAnomalyRequest, bool]]) -> Confusion:
    cm = Confusion()
    for req, expected in cases:
        res: ClusterDetectionResult = service.predict(req)
        predicted = res.is_anomaly
        if predicted and expected:
            cm.tp += 1
        elif predicted and not expected:
            cm.fp += 1
        elif not predicted and not expected:
            cm.tn += 1
        else:
            cm.fn += 1
    return cm


def generate_test_data() -> None:
    # 正常データ: 生活に即した購買（合計60件）
    #  - 若年女性が夜にゲームを1本購入（5件）
    #  - エンジニア男性が深夜にPC周辺機器を1台購入（5件）
    #  - 学生男性が夕方に書籍を1冊購入（5件）
    #  - 主婦が日中に食品をまとめ買い（5件）
    #  - プレミアム男性が夜にゲーム高額品を購入（5件）
    #  - 贈答や生活変化でギフト券少量やスキンケア/DIY/インテリアを購入（35件: 境界ケース多め）
    # 異常データ: 学習分布から外れた購買（合計60件）
    #  - シニア女性がギフト券を深夜や高額・複数枚購入（10件）
    #  - 深夜・早朝の高額まとめ買い（美容大量、PC周辺機器大量、ファッション高額など）、属性・時間帯のずれた高額購買（50件）
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    normal_core = [
        # 学習分布の中核
        dict(age=28, gender=2, prefecture=14, product_category=10, quantity=1, price=7000, total_amount=7000, purchase_time=20, limited_flag=0, payment_method=3, manufacturer=10, pc1=0.66, pc2=0.78),
        dict(age=35, gender=1, prefecture=13, product_category=1, quantity=1, price=22000, total_amount=22000, purchase_time=22, limited_flag=0, payment_method=3, manufacturer=5, pc1=0.82, pc2=0.18),
        dict(age=22, gender=1, prefecture=13, product_category=3, quantity=1, price=1800, total_amount=1800, purchase_time=19, limited_flag=0, payment_method=1, manufacturer=6, pc1=0.28, pc2=0.42),
        dict(age=65, gender=2, prefecture=27, product_category=4, quantity=2, price=1200, total_amount=2400, purchase_time=11, limited_flag=0, payment_method=2, manufacturer=8, pc1=0.18, pc2=0.58),
        dict(age=55, gender=1, prefecture=23, product_category=10, quantity=1, price=22000, total_amount=22000, purchase_time=21, limited_flag=0, payment_method=3, manufacturer=20, pc1=0.66, pc2=0.78),
    ]

    normal_border = [
        # 境界: 生活変化・贈答など、分布内だが周辺のケース（ギフト券少量や時間帯ブレも含む）
        dict(age=35, gender=1, prefecture=13, product_category=8, quantity=1, price=5800, total_amount=5800, purchase_time=18, limited_flag=0, payment_method=3, manufacturer=16, pc1=0.36, pc2=0.68),  # 男性がスキンケア（贈答）
        dict(age=28, gender=2, prefecture=14, product_category=12, quantity=1, price=4500, total_amount=4500, purchase_time=13, limited_flag=0, payment_method=5, manufacturer=4, pc1=0.52, pc2=0.24),   # 女性が工具をDIY用に
        dict(age=65, gender=2, prefecture=27, product_category=9, quantity=1, price=4200, total_amount=4200, purchase_time=15, limited_flag=0, payment_method=2, manufacturer=18, pc1=0.48, pc2=0.32),   # インテリア買い替え
        dict(age=22, gender=1, prefecture=13, product_category=4, quantity=2, price=1280, total_amount=2560, purchase_time=17, limited_flag=1, payment_method=2, manufacturer=9, pc1=0.18, pc2=0.58),   # お菓子ギフト
        dict(age=55, gender=1, prefecture=23, product_category=6, quantity=1, price=3800, total_amount=3800, purchase_time=19, limited_flag=0, payment_method=3, manufacturer=12, pc1=0.42, pc2=0.56),  # ペットフード切替
        dict(age=30, gender=2, prefecture=14, product_category=11, quantity=1, price=3000, total_amount=3000, purchase_time=21, limited_flag=0, payment_method=3, manufacturer=2, pc1=0.9, pc2=0.9),   # 婚約祝いにギフト券を1枚
        dict(age=32, gender=1, prefecture=13, product_category=11, quantity=2, price=5000, total_amount=10000, purchase_time=9, limited_flag=0, payment_method=3, manufacturer=5, pc1=0.9, pc2=0.9),    # 同僚退職の贈答ギフト券
        dict(age=40, gender=1, prefecture=23, product_category=11, quantity=1, price=3000, total_amount=3000, purchase_time=12, limited_flag=0, payment_method=5, manufacturer=4, pc1=0.9, pc2=0.9),    # 父の日ギフト券
        dict(age=45, gender=2, prefecture=13, product_category=11, quantity=1, price=8000, total_amount=8000, purchase_time=14, limited_flag=0, payment_method=3, manufacturer=3, pc1=0.9, pc2=0.9),   # 引っ越し祝いのギフト券
        dict(age=50, gender=1, prefecture=27, product_category=11, quantity=2, price=4000, total_amount=8000, purchase_time=16, limited_flag=0, payment_method=3, manufacturer=1, pc1=0.9, pc2=0.9),   # 子供の進学祝いギフト券
        dict(age=38, gender=2, prefecture=13, product_category=11, quantity=2, price=6000, total_amount=12000, purchase_time=1, limited_flag=1, payment_method=3, manufacturer=6, pc1=0.9, pc2=0.9),    # 深夜明けに贈答ギフト券をまとめ買い
        dict(age=42, gender=1, prefecture=14, product_category=11, quantity=2, price=2500, total_amount=5000, purchase_time=23, limited_flag=1, payment_method=2, manufacturer=7, pc1=1.3, pc2=-1.3),    # 夜更けに小額ギフト券を複数購入
        dict(age=48, gender=2, prefecture=23, product_category=11, quantity=2, price=3500, total_amount=7000, purchase_time=6, limited_flag=0, payment_method=5, manufacturer=8, pc1=0.9, pc2=0.9),    # 朝の少額ギフト券まとめ
        dict(age=36, gender=1, prefecture=13, product_category=2, quantity=2, price=39800, total_amount=79600, purchase_time=0, limited_flag=1, payment_method=3, manufacturer=4, pc1=1.8, pc2=-1.2),  # 家電を深夜にまとめ買い
        dict(age=33, gender=2, prefecture=14, product_category=5, quantity=2, price=9000, total_amount=18000, purchase_time=5, limited_flag=1, payment_method=3, manufacturer=10, pc1=0.55, pc2=0.52),  # 朝スポーツ用品まとめ買い
        dict(age=46, gender=1, prefecture=23, product_category=9, quantity=2, price=15800, total_amount=31600, purchase_time=23, limited_flag=1, payment_method=3, manufacturer=18, pc1=1.6, pc2=-1.1),  # 深夜のインテリア買い替えを一度に
        dict(age=29, gender=2, prefecture=27, product_category=8, quantity=5, price=5800, total_amount=29000, purchase_time=23, limited_flag=1, payment_method=3, manufacturer=16, pc1=2.0, pc2=-1.4),  # 深夜美容まとめ買い
    ]

    anomaly_core = [
        # シニア女性×ギフト券（学習では除外している分布）: 10件に収める
        dict(age=65, gender=2, prefecture=27, product_category=11, quantity=1, price=5000, total_amount=5000, purchase_time=10, limited_flag=0, payment_method=3, manufacturer=2, pc1=0.9, pc2=0.9),
        dict(age=60, gender=2, prefecture=23, product_category=11, quantity=2, price=3000, total_amount=6000, purchase_time=1, limited_flag=0, payment_method=3, manufacturer=4, pc1=0.9, pc2=0.9),
        dict(age=70, gender=2, prefecture=13, product_category=11, quantity=3, price=8000, total_amount=24000, purchase_time=23, limited_flag=0, payment_method=3, manufacturer=1, pc1=0.9, pc2=0.9),
        dict(age=67, gender=2, prefecture=27, product_category=11, quantity=2, price=6000, total_amount=12000, purchase_time=2, limited_flag=0, payment_method=3, manufacturer=5, pc1=0.9, pc2=0.9),
        dict(age=63, gender=2, prefecture=23, product_category=11, quantity=1, price=7000, total_amount=7000, purchase_time=4, limited_flag=0, payment_method=3, manufacturer=4, pc1=0.9, pc2=0.9),
        dict(age=66, gender=2, prefecture=14, product_category=11, quantity=2, price=9000, total_amount=18000, purchase_time=22, limited_flag=0, payment_method=3, manufacturer=6, pc1=0.9, pc2=0.9),
        dict(age=68, gender=2, prefecture=23, product_category=11, quantity=3, price=10000, total_amount=30000, purchase_time=0, limited_flag=0, payment_method=3, manufacturer=7, pc1=0.9, pc2=0.9),
        dict(age=62, gender=2, prefecture=27, product_category=11, quantity=1, price=12000, total_amount=12000, purchase_time=3, limited_flag=0, payment_method=3, manufacturer=3, pc1=0.9, pc2=0.9),
        dict(age=69, gender=2, prefecture=13, product_category=11, quantity=2, price=11000, total_amount=22000, purchase_time=5, limited_flag=0, payment_method=3, manufacturer=8, pc1=0.9, pc2=0.9),
        dict(age=71, gender=2, prefecture=27, product_category=11, quantity=4, price=8000, total_amount=32000, purchase_time=6, limited_flag=0, payment_method=3, manufacturer=9, pc1=0.9, pc2=0.9),
    ]

    anomaly_border = [
        # ギフト券以外も混ぜた境界ケース（属性と金額・時間帯がずれる）
        dict(age=40, gender=1, prefecture=13, product_category=8, quantity=5, price=5800, total_amount=29000, purchase_time=2, limited_flag=0, payment_method=3, manufacturer=16, pc1=0.36, pc2=0.68),  # 男性が深夜に美容大量買い
        dict(age=32, gender=2, prefecture=14, product_category=1, quantity=3, price=60000, total_amount=180000, purchase_time=3, limited_flag=0, payment_method=3, manufacturer=2, pc1=0.82, pc2=0.18),  # 深夜に高額PC周辺機器まとめ買い
        dict(age=45, gender=2, prefecture=23, product_category=7, quantity=4, price=15000, total_amount=60000, purchase_time=0, limited_flag=1, payment_method=5, manufacturer=14, pc1=0.63, pc2=0.41),  # 夜中にファッション高額まとめ買い
        dict(age=39, gender=1, prefecture=13, product_category=2, quantity=2, price=39800, total_amount=79600, purchase_time=1, limited_flag=0, payment_method=3, manufacturer=4, pc1=0.74, pc2=0.22),  # 深夜家電複数台
        dict(age=31, gender=2, prefecture=14, product_category=5, quantity=3, price=9000, total_amount=27000, purchase_time=5, limited_flag=1, payment_method=3, manufacturer=10, pc1=0.55, pc2=0.52),  # 早朝スポーツ用品高額
        dict(age=44, gender=1, prefecture=23, product_category=9, quantity=2, price=15800, total_amount=31600, purchase_time=4, limited_flag=0, payment_method=3, manufacturer=18, pc1=0.48, pc2=0.32),  # 早朝インテリア高額
        dict(age=26, gender=2, prefecture=27, product_category=8, quantity=6, price=5800, total_amount=34800, purchase_time=23, limited_flag=1, payment_method=3, manufacturer=16, pc1=2.1, pc2=-1.3),  # 深夜美容大量
        dict(age=52, gender=1, prefecture=14, product_category=2, quantity=3, price=39800, total_amount=119400, purchase_time=2, limited_flag=0, payment_method=3, manufacturer=4, pc1=0.74, pc2=0.22),  # 深夜家電まとめ買い
        dict(age=36, gender=2, prefecture=23, product_category=5, quantity=4, price=9000, total_amount=36000, purchase_time=1, limited_flag=1, payment_method=3, manufacturer=10, pc1=0.55, pc2=0.52),  # 深夜スポーツ用品大量
        dict(age=42, gender=1, prefecture=13, product_category=7, quantity=5, price=15000, total_amount=75000, purchase_time=3, limited_flag=1, payment_method=5, manufacturer=14, pc1=0.63, pc2=0.41),  # 深夜ファッション高額
    ]

    def repeat_to(target: int, patterns: list[dict]) -> list[dict]:
        rows = []
        idx = 0
        while len(rows) < target:
            rows.append(patterns[idx % len(patterns)].copy())
            idx += 1
        return rows

    normal_rows = repeat_to(25, normal_core) + repeat_to(35, normal_border)
    anomaly_rows = repeat_to(10, anomaly_core) + repeat_to(50, anomaly_border)

    for path, rows in [(NORMAL_PATH, normal_rows), (ANOMALY_PATH, anomaly_rows)]:
        with path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)


def main() -> None:
    generate_test_data()
    detector = ClusterAnomalyDetector(models_dir=config.CLUSTER_MODELS_DIR)
    detector.load_models()
    service = ClusterDetectionService(detector)

    normal_cases = load_cases(NORMAL_PATH, expected_is_anomaly=False)
    anomaly_cases = load_cases(ANOMALY_PATH, expected_is_anomaly=True)
    all_cases = [*normal_cases, *anomaly_cases]

    cm = evaluate(service, all_cases)

    print("=== クラスタ異常検知 混同行列 ===")
    print(f"  TP (異常を当てた)      : {cm.tp}")
    print(f"  FP (誤検知)           : {cm.fp}")
    print(f"  TN (正常を当てた)     : {cm.tn}")
    print(f"  FN (見逃し)           : {cm.fn}")
    print(f"  合計                  : {cm.total}")
    if cm.total:
        acc = (cm.tp + cm.tn) / cm.total
        precision = cm.tp / (cm.tp + cm.fp) if (cm.tp + cm.fp) else 0.0
        recall = cm.tp / (cm.tp + cm.fn) if (cm.tp + cm.fn) else 0.0
        print(f"\n  Accuracy  : {acc:.3f}")
        print(f"  Precision : {precision:.3f}")
        print(f"  Recall    : {recall:.3f}")
        print(f"  F1        : {0 if precision + recall == 0 else 2*precision*recall/(precision+recall):.3f}")

    if cm.fp or cm.fn:
        print("\n誤検知/見逃しあり: データやモデルを見直してください。")


if __name__ == "__main__":
    main()
