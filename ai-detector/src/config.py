"""アプリケーション全体で利用する設定値とパス定義。"""

from __future__ import annotations

import os
from pathlib import Path


# プロジェクトルート（ai-detector ディレクトリ）
BASE_DIR = Path(__file__).resolve().parents[1]

# モデル配置ディレクトリ
MODELS_DIR = BASE_DIR / "models"
LIGHTGBM_MODEL_PATH = MODELS_DIR / "browser" / "model.txt"
CLUSTER_MODELS_DIR = MODELS_DIR / "persona"

# データディレクトリ（必要に応じて利用）
DATA_DIR = BASE_DIR / "data"

# トレーニングログ設定
_training_log_dir_env = os.getenv("AI_DETECTOR_TRAINING_LOG_PATH")
if _training_log_dir_env:
    _log_dir_candidate = Path(_training_log_dir_env).expanduser()
    if not _log_dir_candidate.is_absolute():
        TRAINING_LOG_BASE_DIR = (BASE_DIR / _log_dir_candidate).resolve()
    else:
        TRAINING_LOG_BASE_DIR = _log_dir_candidate.resolve()
else:
    TRAINING_LOG_BASE_DIR = (BASE_DIR / "training" / "browser" / "data").resolve()

_training_log_label = os.getenv("AI_DETECTOR_LOG_LABEL", "unspecified").strip().lower()
if _training_log_label not in {"human", "bot"}:
    _training_log_label = "unspecified"

TRAINING_LOG_LABEL = _training_log_label
TRAINING_LOG_DIR = (TRAINING_LOG_BASE_DIR / TRAINING_LOG_LABEL).resolve()

TRAINING_LOG_ENABLED = os.getenv("AI_DETECTOR_TRAINING_LOG", "").lower() in {"1", "true", "on", "yes"}

# モデル利用制御
BROWSER_MODEL_DISABLED = os.getenv("AI_DETECTOR_DISABLE_BROWSER_MODEL", "").lower() in {
    "1",
    "true",
    "on",
    "yes",
}
