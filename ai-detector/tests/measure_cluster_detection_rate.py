#!/usr/bin/env python3
"""クラスタ異常検知の検知率を測定するスクリプト。"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

# src をパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import config
from models.cluster_detector import ClusterAnomalyDetector
from schemas.cluster import ClusterAnomalyRequest
from services.cluster_service import ClusterDetectionResult, ClusterDetectionService


@dataclass
class ConfusionMatrix:
    """混同行列を表すデータクラス。"""

    tp: int = 0  # True Positive
    fp: int = 0  # False Positive
    tn: int = 0  # True Negative
    fn: int = 0  # False Negative

    @property
    def total(self) -> int:
        """総データ数。"""
        return self.tp + self.fp + self.tn + self.fn

    @property
    def positives(self) -> int:
        """実際の異常数。"""
        return self.tp + self.fn

    @property
    def negatives(self) -> int:
        """実際の正常数。"""
        return self.tn + self.fp


@dataclass
class Metrics:
    """評価指標を表すデータクラス。"""

    accuracy: float
    precision: float
    recall: float
    f1_score: float
    specificity: float
    false_positive_rate: float
    false_negative_rate: float

    @classmethod
    def from_confusion_matrix(cls, cm: ConfusionMatrix) -> Metrics:
        """混同行列から評価指標を計算。"""
        total = cm.total
        if total == 0:
            return cls(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

        accuracy = (cm.tp + cm.tn) / total if total > 0 else 0.0
        precision = cm.tp / (cm.tp + cm.fp) if (cm.tp + cm.fp) > 0 else 0.0
        recall = cm.tp / (cm.tp + cm.fn) if (cm.tp + cm.fn) > 0 else 0.0
        f1_score = (
            2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        )
        specificity = cm.tn / cm.negatives if cm.negatives > 0 else 0.0
        false_positive_rate = cm.fp / cm.negatives if cm.negatives > 0 else 0.0
        false_negative_rate = cm.fn / cm.positives if cm.positives > 0 else 0.0

        return cls(accuracy, precision, recall, f1_score, specificity, false_positive_rate, false_negative_rate)


class ClusterDetectionRateMeasurer:
    """クラスタ異常検知の検知率を測定するクラス。"""

    def __init__(self, models_dir: Path | None = None) -> None:
        """初期化。

        Args:
            models_dir: モデルディレクトリ。Noneの場合はconfigから取得。
        """
        self.models_dir = models_dir or config.CLUSTER_MODELS_DIR
        if not self.models_dir.exists():
            raise FileNotFoundError(f"クラスタモデルが見つかりません: {self.models_dir}")

        self.detector = ClusterAnomalyDetector(models_dir=self.models_dir)
        self.detector.load_models()
        self.service = ClusterDetectionService(self.detector)

    def load_test_cases(
        self, data_path: Path, all_normal: bool = True
    ) -> List[Tuple[ClusterAnomalyRequest, bool | None]]:
        """テストケースを読み込む。

        Args:
            data_path: テストデータのパス。
            all_normal: Trueの場合、すべて正常データとして扱う。Falseの場合、expected_is_anomalyを使用。

        Returns:
            (リクエスト, 期待ラベル)のリスト。all_normal=Trueの場合は期待ラベルはNone。
        """
        cases = []
        with data_path.open("r", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                expected = None
                if not all_normal and "expected_is_anomaly" in row:
                    expected = bool(int(row.pop("expected_is_anomaly")))

                payload = {key: int(value) for key, value in row.items()}
                request = ClusterAnomalyRequest(**payload)
                cases.append((request, expected))

        return cases

    def predict(self, cases: List[Tuple[ClusterAnomalyRequest, bool | None]]) -> List[Tuple[ClusterAnomalyRequest, ClusterDetectionResult, bool | None]]:
        """推論を実行。

        Args:
            cases: テストケースのリスト。

        Returns:
            (リクエスト, 結果, 期待ラベル)のリスト。
        """
        results = []
        for request, expected in cases:
            result = self.service.predict(request)
            results.append((request, result, expected))
        return results

    def calculate_confusion_matrix(
        self, results: List[Tuple[ClusterAnomalyRequest, ClusterDetectionResult, bool | None]]
    ) -> Tuple[ConfusionMatrix, List[Tuple[ClusterAnomalyRequest, ClusterDetectionResult, str]]]:
        """混同行列を計算。

        Args:
            results: 推論結果のリスト。

        Returns:
            (混同行列, 失敗ケースのリスト)。
        """
        cm = ConfusionMatrix()
        failed_cases = []

        for request, result, expected in results:
            predicted = result.is_anomaly
            actual = expected if expected is not None else False  # all_normal=Trueの場合はFalse

            if predicted and actual:
                cm.tp += 1
            elif predicted and not actual:
                cm.fp += 1
                failed_cases.append((request, result, "False Positive (誤検知)"))
            elif not predicted and not actual:
                cm.tn += 1
            elif not predicted and actual:
                cm.fn += 1
                failed_cases.append((request, result, "False Negative (見逃し)"))

        return cm, failed_cases

    def print_results(
        self,
        cm: ConfusionMatrix,
        metrics: Metrics,
        failed_cases: List[Tuple[ClusterAnomalyRequest, ClusterDetectionResult, str]],
        all_normal: bool,
    ) -> None:
        """結果を表示。

        Args:
            cm: 混同行列。
            metrics: 評価指標。
            failed_cases: 失敗ケースのリスト。
            all_normal: すべて正常データとして評価したかどうか。
        """
        print("=" * 80)
        if all_normal:
            print("クラスタ異常検知 - 検知率測定結果（すべて正常データとして評価）")
        else:
            print("クラスタ異常検知 - 検知率測定結果")
        print("=" * 80)

        if all_normal:
            print("\n【前提条件】")
            print("  テストデータはすべて正常な購買データ")
            print("  異常と判定されたものは「誤検知（False Positive）」")
            print("  正常と判定されたものは「正しく正常と判定（True Negative）」")
            print()

        print(f"テストデータ数: {cm.total}件")
        if not all_normal:
            print(f"  実際の異常: {cm.positives}件")
            print(f"  実際の正常: {cm.negatives}件")
        print()

        print("混同行列:")
        print(f"  True Positive (TP):  {cm.tp:2d} - 異常と予測して実際に異常")
        print(f"  False Positive (FP): {cm.fp:2d} - 異常と予測したが実際は正常（誤検知）")
        print(f"  True Negative (TN):  {cm.tn:2d} - 正常と予測して実際に正常")
        print(f"  False Negative (FN): {cm.fn:2d} - 正常と予測したが実際は異常（見逃し）")
        print()

        print("評価指標:")
        print(f"  精度 (Accuracy):              {metrics.accuracy:.2%} ({cm.tp + cm.tn}/{cm.total})")
        print(f"  適合率 (Precision):           {metrics.precision:.2%} ({cm.tp}/{cm.tp + cm.fp})" if (cm.tp + cm.fp) > 0 else "  適合率 (Precision):           N/A")
        if cm.positives > 0:
            print(f"  再現率 (Recall):               {metrics.recall:.2%} ({cm.tp}/{cm.positives})")
            print(f"  F1スコア:                      {metrics.f1_score:.2%}")
        print(f"  特異度 (Specificity):          {metrics.specificity:.2%} ({cm.tn}/{cm.negatives})")
        print()
        print("【主要指標】")
        if cm.positives > 0:
            print(f"  検知率 (Detection Rate):       {metrics.recall:.2%} ({cm.tp}/{cm.positives})")
            print(f"    → 異常データのうち、正しく異常と判定できた割合")
        else:
            print(f"  検知率 (Detection Rate):       N/A (異常データが存在しません)")
        print(f"  誤検知率 (False Positive Rate): {metrics.false_positive_rate:.2%} ({cm.fp}/{cm.negatives})")
        print(f"    → 正常データのうち、誤って異常と判定した割合")
        if cm.positives > 0:
            print(f"  見逃し率 (False Negative Rate): {metrics.false_negative_rate:.2%} ({cm.fn}/{cm.positives})")
            print(f"    → 異常データのうち、誤って正常と判定した割合")
        else:
            print(f"  見逃し率 (False Negative Rate): N/A (異常データが存在しません)")
        print()

        if failed_cases:
            print("=" * 80)
            print(f"失敗ケース ({len(failed_cases)}件):")
            print("=" * 80)
            for idx, (request, result, error_type) in enumerate(failed_cases, 1):
                print(f"\n【失敗ケース {idx}】{error_type}")
                print(f"  年齢: {request.age}, 性別: {request.gender}, 都道府県: {request.prefecture}")
                print(f"  商品カテゴリ: {request.product_category}, 数量: {request.quantity}")
                print(f"  単価: {request.price:,}円, 総額: {request.total_amount:,}円")
                print(f"  購入時間: {request.purchase_time}時, 限定品: {request.limited_flag}")
                print(f"  決済手段: {request.payment_method}, メーカー: {request.manufacturer}")
                print(f"  クラスタID: {result.cluster_id}")
                print(f"  異常スコア: {result.anomaly_score:.4f}")
                print(f"  閾値: {result.threshold:.4f}")
                if error_type == "False Positive (誤検知)":
                    print(f"  理由: 正常なデータだが、クラスタ{result.cluster_id}の正常な購買パターンから外れていると判定された")
        else:
            print("=" * 80)
            print("失敗ケース: なし（すべて正しく判定できました）")
            print("=" * 80)

        print()
        print("=" * 80)
        print("【検知率・誤検知率・見逃し率のまとめ】")
        print("=" * 80)
        print()
        if cm.positives > 0:
            print(f"検知率 (Detection Rate):       {metrics.recall:.2%} ({cm.tp}/{cm.positives})")
            print(f"  → 異常データのうち、正しく異常と判定できた割合")
            print(f"  → 高いほど良い（目標: 70%以上）")
            print()
            print(f"見逃し率 (False Negative Rate): {metrics.false_negative_rate:.2%} ({cm.fn}/{cm.positives})")
            print(f"  → 異常データのうち、誤って正常と判定した割合")
            print(f"  → 低いほど良い（検知率 = 1 - 見逃し率）")
            print()
        else:
            print("検知率・見逃し率: 異常データが存在しないため測定できません")
            print()
        print(f"誤検知率 (False Positive Rate): {metrics.false_positive_rate:.2%} ({cm.fp}/{cm.negatives})")
        print(f"  → 正常データのうち、誤って異常と判定した割合")
        print(f"  → 低いほど良い")
        print()
        if all_normal:
            print("※ すべてのテストデータが正常であるため、検知率と見逃し率は測定できません")
            print("※ 異常データでの評価には、実際の異常データセットが必要です")
        print("=" * 80)

    def measure(
        self, data_path: Path, all_normal: bool = True
    ) -> Tuple[ConfusionMatrix, Metrics, List[Tuple[ClusterAnomalyRequest, ClusterDetectionResult, str]]]:
        """検知率を測定。

        Args:
            data_path: テストデータのパス。
            all_normal: Trueの場合、すべて正常データとして扱う。

        Returns:
            (混同行列, 評価指標, 失敗ケースのリスト)。
        """
        cases = self.load_test_cases(data_path, all_normal=all_normal)
        results = self.predict(cases)
        cm, failed_cases = self.calculate_confusion_matrix(results)
        metrics = Metrics.from_confusion_matrix(cm)
        return cm, metrics, failed_cases


def main() -> None:
    """メイン処理。"""
    parser = argparse.ArgumentParser(description="クラスタ異常検知の検知率を測定")
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).parent / "data" / "cluster_detection_cases_real.csv",
        help="テストデータのパス",
    )
    parser.add_argument(
        "--all-normal",
        action="store_true",
        default=True,
        help="すべて正常データとして評価（デフォルト: True）",
    )
    parser.add_argument(
        "--use-expected",
        action="store_true",
        help="expected_is_anomalyを使用して評価（--all-normalと排他的）",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=None,
        help="モデルディレクトリ（デフォルト: configから取得）",
    )

    args = parser.parse_args()

    if args.use_expected:
        args.all_normal = False

    try:
        measurer = ClusterDetectionRateMeasurer(models_dir=args.models_dir)
        cm, metrics, failed_cases = measurer.measure(args.data, all_normal=args.all_normal)
        measurer.print_results(cm, metrics, failed_cases, all_normal=args.all_normal)
    except FileNotFoundError as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"予期しないエラーが発生しました: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

