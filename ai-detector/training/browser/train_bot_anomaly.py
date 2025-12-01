#!/usr/bin/env python3
"""Bot 行動のみで IsolationForest を学習し、異常(=human らしさ)スコアを返すモデルを作る。"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Sequence

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

SCRIPT_PATH = Path(__file__).resolve()
PROJECT_ROOT = SCRIPT_PATH.parents[2]


def _configure_pythonpath() -> None:
    src_dir = PROJECT_ROOT / "src"
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))


_configure_pythonpath()

from models.lightgbm_loader import DEFAULT_FEATURE_NAMES  # noqa: E402  # isort: skip
from services.feature_extractor import FeatureExtractor  # noqa: E402  # isort: skip
from schemas.detection import UnifiedDetectionRequest  # noqa: E402  # isort: skip

LOGGER = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bot-glob",
        action="append",
        default=["training/browser/data/bot/*.json*"],
        help="bot データの glob。複数指定可。",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("training/browser/model"),
        help="モデルやメトリクスの出力ディレクトリ。",
    )
    parser.add_argument("--contamination", type=float, default=0.05, help="IsolationForest contamination。")
    parser.add_argument("--n-estimators", type=int, default=200, help="IsolationForest n_estimators。")
    parser.add_argument("--max-samples", default="auto", help="IsolationForest max_samples。")
    parser.add_argument("--random-state", type=int, default=42, help="乱数 seed。")
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


def load_bot_samples(paths: Sequence[Path], extractor: FeatureExtractor) -> np.ndarray:
    samples: List[np.ndarray] = []
    for path in paths:
        for record in iter_json_records(path):
            payload = record.get("request", record)
            try:
                request = UnifiedDetectionRequest.model_validate(payload)
            except Exception as exc:
                LOGGER.warning("skip invalid record (%s): %s", path, exc)
                continue
            features = extractor.extract(request)
            vec = np.array([features[name] for name in extractor.feature_names], dtype=np.float32)
            samples.append(vec)
    return np.vstack(samples) if samples else np.empty((0, len(extractor.feature_names)), dtype=np.float32)


def _compute_similarity_scores(
    X: np.ndarray, feature_names: List[str], stats: Dict[str, Dict[str, float]], keys: List[str]
) -> np.ndarray:
    """feature_stats を使ってボットとの近さ(0-1)を返す。"""
    mean = stats["mean"]
    std = stats["std"]
    indices = [feature_names.index(k) for k in keys if k in feature_names and std.get(k, 0) > 0]
    if not indices:
        return np.full(X.shape[0], 0.5, dtype=float)

    subset = X[:, indices]
    means = np.array([mean[feature_names[i]] for i in indices])
    stds = np.array([std[feature_names[i]] for i in indices])
    z = np.abs((subset - means) / stds)
    avg_z = np.mean(z, axis=1)
    return 1.0 / (1.0 + avg_z)


def train_model(X_bot: np.ndarray, feature_names: Iterable[str], args: argparse.Namespace) -> Dict[str, Any]:
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_bot)

    iso = IsolationForest(
        contamination=args.contamination,
        n_estimators=args.n_estimators,
        max_samples=args.max_samples,
        random_state=args.random_state,
        n_jobs=-1,
    )
    iso.fit(X_scaled)

    scores = iso.decision_function(X_scaled)
    score_min, score_max = float(np.min(scores)), float(np.max(scores))
    denom = max(score_max - score_min, 1e-8)
    bot_scores = np.clip((scores - score_min) / denom, 0.0, 1.0)
    bot_threshold = float(np.quantile(bot_scores, 1 - args.contamination))

    feature_stats = {
        "mean": {name: float(np.mean(X_bot[:, idx])) for idx, name in enumerate(feature_names)},
        "std": {name: float(np.std(X_bot[:, idx])) for idx, name in enumerate(feature_names)},
    }

    similarity_keys = [
        "velocity_mean",
        "mouse_event_count",
        "mouse_path_length",
        "sequence_event_count",
        "page_session_duration_ms",
    ]
    similarity_scores = _compute_similarity_scores(X_bot, list(feature_names), feature_stats, similarity_keys)
    combined_bot = (bot_scores + similarity_scores) / 2.0
    combined_threshold = float(np.quantile(combined_bot, 1 - args.contamination))

    return {
        "isolation_forest": iso,
        "scaler": scaler,
        "feature_names": list(feature_names),
        "score_min": score_min,
        "score_max": score_max,
        "bot_threshold": bot_threshold,
        "combined_threshold": combined_threshold,
        "feature_stats": feature_stats,
        "metadata": {
            "contamination": args.contamination,
            "score_stats": {
                "mean": float(np.mean(scores)),
                "std": float(np.std(scores)),
                "min": score_min,
                "max": score_max,
                "quantiles": {q: float(np.quantile(scores, q)) for q in [0.05, 0.1, 0.5, 0.9, 0.95]},
            },
            "bot_score_threshold_quantile": 1 - args.contamination,
        },
    }


def save_artifacts(model_payload: Dict[str, Any], args: argparse.Namespace, num_samples: int) -> Path:
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    artifact_dir = (PROJECT_ROOT / args.output_dir / timestamp).resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    model_path = artifact_dir / "bot_isolation_model.joblib"
    joblib.dump(model_payload, model_path)

    summary = {
        "args": {
            key: str(value) if isinstance(value, Path) else value
            for key, value in vars(args).items()
        },
        "num_samples": num_samples,
        "score_min": model_payload["score_min"],
        "score_max": model_payload["score_max"],
        "bot_threshold": model_payload["bot_threshold"],
        "combined_threshold": model_payload["combined_threshold"],
        "metadata": model_payload["metadata"],
    }
    (artifact_dir / "training_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
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
    bot_paths = collect_paths(args.bot_glob, PROJECT_ROOT)
    LOGGER.info("Found %d bot files", len(bot_paths))

    X_bot = load_bot_samples(bot_paths, extractor)
    if X_bot.size == 0:
        LOGGER.error("No bot samples loaded. Please check input paths.")
        sys.exit(1)

    model_payload = train_model(X_bot, extractor.feature_names, args)
    artifact_dir = save_artifacts(model_payload, args, num_samples=X_bot.shape[0])
    LOGGER.info("Training finished. Model saved at %s", artifact_dir / "bot_isolation_model.joblib")


if __name__ == "__main__":
    main()
