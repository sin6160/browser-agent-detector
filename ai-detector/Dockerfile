FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AI_DETECTOR_BASE_DIR=/app

# debconf ダイアログを抑止
ARG DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv (lock インストーラ)
RUN pip install --no-cache-dir uv

# 依存メタデータとコード・モデルをコピー（ビルド時にパッケージを参照するため先に配置）
COPY pyproject.toml uv.lock* README.md /app/
COPY src /app/src
COPY models /app/models

# uv で pyproject/uv.lock に基づきインストール（ロックがあれば自動利用）
RUN uv pip install --system .

EXPOSE 8080

# Cloud Run が設定する PORT を使い、未設定時は 8080
CMD ["sh", "-c", "uvicorn api.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
