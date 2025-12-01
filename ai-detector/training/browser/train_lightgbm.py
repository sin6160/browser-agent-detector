#!/usr/bin/env python3
"""Human / bot ブラウザ行動データの LightGBM 学習スクリプト。"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Sequence

import lightgbm as lgb
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split


SCRIPT_PATH = Path(__file__).resolve()
PROJECT_ROOT = SCRIPT_PATH.parents[2]

HUMAN_LABEL = 1
BOT_LABEL = 0


def _configure_pythonpath() -> None:
    """ai-detector/src を import path に追加する。"""

    src_dir = PROJECT_ROOT / "src"
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))


_configure_pythonpath()

from models.lightgbm_loader import DEFAULT_FEATURE_NAMES  # noqa: E402  # isort: skip
from services.feature_extractor import FeatureExtractor  # noqa: E402  # isort: skip
from schemas.detection import UnifiedDetectionRequest  # noqa: E402  # isort: skip


LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class Sample:
    """1 リクエスト分の特徴量とメタデータ。"""

    features: np.ndarray
    label: int
    session_id: str | None
    request_id: str | None
    source_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--human-glob",
        action="append",
        default=["training/browser/data/human/*.json*"],
        help="人間データの glob。複数指定可。",
    )
    parser.add_argument(
        "--bot-glob",
        action="append",
        default=["training/browser/data/bot/*.json*"],
        help="AI データの glob。複数指定可。",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("training/browser/model"),
        help="モデルやメトリクスの出力ディレクトリ。",
    )
    parser.add_argument(
        "--valid-ratio",
        type=float,
        default=0.2,
        help="検証データの割合 (0-1)。0 を指定すると全件学習。",
    )
    parser.add_argument("--random-state", type=int, default=42, help="乱数 seed。")
    parser.add_argument("--num-boost-round", type=int, default=500, help="学習ラウンド。")
    parser.add_argument("--early-stopping-rounds", type=int, default=50, help="Early stopping patience。")
    parser.add_argument("--learning-rate", type=float, default=0.03, help="LightGBM learning_rate。")
    parser.add_argument("--num-leaves", type=int, default=31, help="num_leaves。")
    parser.add_argument("--feature-fraction", type=float, default=0.7, help="feature_fraction。")
    parser.add_argument("--bagging-fraction", type=float, default=0.7, help="bagging_fraction。")
    parser.add_argument("--min-data-in-leaf", type=int, default=15, help="min_data_in_leaf。")
    parser.add_argument(
        "--max-depth",
        type=int,
        default=4,
        help="max_depth。-1 を指定すると制限なし。",
    )
    parser.add_argument("--bagging-freq", type=int, default=5, help="bagging_freq。")
    parser.add_argument(
        "--num-threads",
        type=int,
        default=0,
        help="LightGBM が使用するスレッド数。0 で自動。",
    )
    parser.add_argument(
        "--lambda-l1",
        type=float,
        default=0.1,
        help="L1 正則化係数。",
    )
    parser.add_argument(
        "--lambda-l2",
        type=float,
        default=0.1,
        help="L2 正則化係数。",
    )
    parser.add_argument(
        "--min-split-gain",
        type=float,
        default=0.01,
        help="最小分割ゲイン (min_split_gain)。",
    )
    parser.add_argument(
        "--auto-scale-pos-weight",
        action="store_true",
        help="訓練データのクラス比から scale_pos_weight を自動計算する。",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="ログレベル。",
    )
    return parser.parse_args()


def collect_paths(patterns: Sequence[str], base_dir: Path) -> List[Path]:
    paths: List[Path] = []
    for pattern in patterns:
        raw_pattern = Path(pattern)
        resolved_pattern = raw_pattern if raw_pattern.is_absolute() else base_dir / pattern
        for matched in glob.glob(str(resolved_pattern)):
            path = Path(matched)
            if path.is_file():
                paths.append(path)
    return sorted(paths)


def iter_json_records(path: Path) -> Iterator[Dict]:
    """JSON / JSONL から dict を yield する。"""

    text = path.read_text(encoding="utf-8")
    if path.suffix == ".jsonl":
        for line_no, line in enumerate(text.splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                LOGGER.warning("JSONL decode error %s line %s: %s", path, line_no, exc)
    else:
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            LOGGER.warning("JSON decode error %s: %s", path, exc)
            return

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    yield item
        elif isinstance(data, dict):
            yield data


def build_samples(paths: Sequence[Path], label: int, extractor: FeatureExtractor) -> List[Sample]:
    samples: List[Sample] = []
    for path in paths:
        for record in iter_json_records(path):
            payload = record.get("request", record)
            try:
                request = UnifiedDetectionRequest.model_validate(payload)
            except Exception as exc:
                LOGGER.warning("skip invalid record (%s): %s", path, exc)
                continue

            features_dict = extractor.extract(request)
            feature_vector = np.array([features_dict[name] for name in extractor.feature_names], dtype=np.float32)
            samples.append(
                Sample(
                    features=feature_vector,
                    label=label,
                    session_id=request.session_id,
                    request_id=request.request_id,
                    source_path=path,
                )
            )
    return samples


def split_train_valid(
    samples: Sequence[Sample],
    valid_ratio: float,
    random_state: int,
) -> tuple[np.ndarray, np.ndarray]:
    """セッション単位で train/valid を分割したインデックス配列を返す。"""

    n = len(samples)
    if valid_ratio <= 0 or n == 0:
        return np.arange(n), np.array([], dtype=int)

    session_to_indices: Dict[str, List[int]] = {}
    session_labels: Dict[str, int] = {}
    for idx, sample in enumerate(samples):
        session_id = sample.session_id or f"unknown_{idx}"
        session_to_indices.setdefault(session_id, []).append(idx)
        prev_label = session_labels.get(session_id)
        if prev_label is None:
            session_labels[session_id] = sample.label
        elif prev_label != sample.label:
            LOGGER.warning("session %s has mixed labels; using latest one", session_id)
            session_labels[session_id] = sample.label

    unique_sessions = list(session_to_indices)
    if len(unique_sessions) < 2:
        LOGGER.warning("Not enough sessions for validation split; using all data for training.")
        return np.arange(n), np.array([], dtype=int)

    stratify = [session_labels[s] for s in unique_sessions]
    test_size = max(valid_ratio, 1 / len(unique_sessions))
    try:
        train_sessions, valid_sessions = train_test_split(
            unique_sessions,
            test_size=test_size,
            stratify=stratify if len(set(stratify)) > 1 else None,
            random_state=random_state,
        )
    except ValueError:
        LOGGER.warning("Failed stratified split; falling back to simple split.")
        train_sessions, valid_sessions = unique_sessions[:-1], unique_sessions[-1:]

    train_indices = [idx for sess in train_sessions for idx in session_to_indices[sess]]
    valid_indices = [idx for sess in valid_sessions for idx in session_to_indices[sess]]
    return np.array(sorted(train_indices)), np.array(sorted(valid_indices))


def train_model(
    train_samples: Sequence[Sample],
    valid_samples: Sequence[Sample] | None,
    args: argparse.Namespace,
) -> tuple[lgb.Booster, Dict[str, float], Dict[str, float]]:
    feature_names = DEFAULT_FEATURE_NAMES
    X_train = np.vstack([s.features for s in train_samples])
    y_train = np.array([s.label for s in train_samples], dtype=np.int32)

    datasets = [lgb.Dataset(X_train, label=y_train, feature_name=feature_names)]
    valid_set = None
    if valid_samples:
        X_valid = np.vstack([s.features for s in valid_samples])
        y_valid = np.array([s.label for s in valid_samples], dtype=np.int32)
        valid_set = lgb.Dataset(X_valid, label=y_valid, reference=datasets[0], feature_name=feature_names)
        datasets.append(valid_set)

    params = {
        "objective": "binary",
        "metric": ["auc", "binary_logloss"],
        "learning_rate": args.learning_rate,
        "num_leaves": args.num_leaves,
        "feature_fraction": args.feature_fraction,
        "bagging_fraction": args.bagging_fraction,
        "bagging_freq": args.bagging_freq,
        "min_data_in_leaf": args.min_data_in_leaf,
        "max_depth": args.max_depth,
        "num_threads": args.num_threads,
        "seed": args.random_state,
        "lambda_l1": args.lambda_l1,
        "lambda_l2": args.lambda_l2,
        "min_split_gain": args.min_split_gain,
    }

    if args.auto_scale_pos_weight:
        pos = int(np.sum(y_train == 1))
        neg = len(y_train) - pos
        if pos > 0 and neg > 0:
            params["scale_pos_weight"] = neg / pos
            LOGGER.info("scale_pos_weight=%.4f", params["scale_pos_weight"])

    callbacks = [lgb.log_evaluation(period=50)]
    if valid_set and args.early_stopping_rounds > 0:
        callbacks.append(lgb.early_stopping(args.early_stopping_rounds, verbose=True))

    booster = lgb.train(
        params,
        datasets[0],
        num_boost_round=args.num_boost_round,
        valid_sets=[datasets[0]] + ([valid_set] if valid_set else []),
        valid_names=["train"] + (["valid"] if valid_set else []),
        callbacks=callbacks or None,
    )

    metrics = evaluate_model(booster, X_train, y_train, prefix="train")
    valid_metrics: Dict[str, float] = {}
    if valid_set is not None:
        metrics.update(valid_metrics := evaluate_model(booster, X_valid, y_valid, prefix="valid"))

    return booster, metrics, valid_metrics


def evaluate_model(booster: lgb.Booster, X: np.ndarray, y: np.ndarray, prefix: str) -> Dict[str, float]:
    preds = booster.predict(X, num_iteration=booster.best_iteration or booster.current_iteration())
    pred_labels = (preds >= 0.5).astype(int)
    metrics = {
        f"{prefix}_roc_auc": roc_auc_score(y, preds) if len(np.unique(y)) > 1 else float("nan"),
        f"{prefix}_pr_auc": average_precision_score(y, preds) if len(np.unique(y)) > 1 else float("nan"),
        f"{prefix}_accuracy": accuracy_score(y, pred_labels),
        f"{prefix}_precision": precision_score(y, pred_labels, zero_division=0),
        f"{prefix}_recall": recall_score(y, pred_labels, zero_division=0),
        f"{prefix}_f1": f1_score(y, pred_labels, zero_division=0),
    }
    LOGGER.info("%s metrics: %s", prefix, metrics)
    return metrics


def save_artifacts(
    booster: lgb.Booster,
    metrics: Dict[str, float],
    args: argparse.Namespace,
    total_samples: Sequence[Sample],
    train_indices: np.ndarray,
    valid_indices: np.ndarray,
) -> Path:
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    artifact_dir = args.output_dir / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    model_path = artifact_dir / "lightgbm_model.txt"
    booster.save_model(str(model_path))

    feature_importance = dict(
        zip(DEFAULT_FEATURE_NAMES, booster.feature_importance(importance_type="gain").tolist())
    )

    args_serializable = {
        key: str(value) if isinstance(value, Path) else value
        for key, value in vars(args).items()
    }

    config = {
        "args": args_serializable,
        "feature_names": DEFAULT_FEATURE_NAMES,
        "label_mapping": {"human": HUMAN_LABEL, "bot": BOT_LABEL},
        "num_samples": len(total_samples),
        "train_samples": train_indices.size,
        "valid_samples": valid_indices.size,
        "num_human": int(sum(sample.label == HUMAN_LABEL for sample in total_samples)),
        "num_bot": int(sum(sample.label == BOT_LABEL for sample in total_samples)),
        "metrics": metrics,
        "feature_importance_gain": feature_importance,
    }

    (artifact_dir / "training_summary.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    LOGGER.info("Artifacts saved to %s", artifact_dir)
    return artifact_dir


def main() -> None:
    args = parse_args()
    if not args.output_dir.is_absolute():
        args.output_dir = PROJECT_ROOT / args.output_dir

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    extractor = FeatureExtractor(DEFAULT_FEATURE_NAMES)
    human_paths = collect_paths(args.human_glob, PROJECT_ROOT)
    bot_paths = collect_paths(args.bot_glob, PROJECT_ROOT)
    LOGGER.info("Found %d human files, %d bot files", len(human_paths), len(bot_paths))

    samples = []
    samples.extend(build_samples(human_paths, label=HUMAN_LABEL, extractor=extractor))
    samples.extend(build_samples(bot_paths, label=BOT_LABEL, extractor=extractor))
    if not samples:
        LOGGER.error("No samples loaded. Please check input paths.")
        sys.exit(1)

    train_indices, valid_indices = split_train_valid(samples, args.valid_ratio, args.random_state)
    train_samples = [samples[i] for i in train_indices]
    valid_samples = [samples[i] for i in valid_indices] if valid_indices.size else None

    booster, metrics, _ = train_model(train_samples, valid_samples, args)
    artifact_dir = save_artifacts(booster, metrics, args, samples, train_indices, valid_indices)
    LOGGER.info("Training finished. Model saved at %s", artifact_dir / "lightgbm_model.txt")


if __name__ == "__main__":
    main()
