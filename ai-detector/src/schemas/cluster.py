"""クラスタ異常検知 API のスキーマ定義。"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ClusterAnomalyRequest(BaseModel):
    """クラスタ異常検知リクエスト。"""

    age: Optional[int] = Field(None, description="年齢")
    gender: Optional[int] = Field(None, description="性別コード (1=男性, 2=女性)")
    prefecture: Optional[int] = Field(None, description="都道府県コード")
    product_category: Optional[int] = Field(None, description="商品カテゴリ")
    quantity: Optional[int] = Field(None, description="購入個数")
    price: Optional[int] = Field(None, description="単価 (円)")
    total_amount: Optional[int] = Field(None, description="総額 (円)")
    purchase_time: Optional[int] = Field(None, description="購入時間 (0-23)")
    limited_flag: Optional[int] = Field(None, description="限定品フラグ")
    payment_method: Optional[int] = Field(None, description="決済手段カテゴリ")
    manufacturer: Optional[int] = Field(None, description="メーカーID")


class ClusterAnomalyResponse(BaseModel):
    """クラスタ異常検知レスポンス。"""

    cluster_id: int = Field(..., description="クラスタID")
    prediction: int = Field(..., description="IsolationForest予測値 (1=正常, -1=異常)")
    anomaly_score: float = Field(..., description="IsolationForestの異常スコア")
    threshold: float = Field(..., description="クラスタ判定閾値")
    is_anomaly: bool = Field(..., description="異常判定フラグ")
    request_id: str = Field(..., description="リクエスト識別子")
