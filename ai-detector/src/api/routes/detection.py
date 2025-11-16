"""AIエージェント統合検知エンドポイント。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_cluster_service, get_detection_service
from models.lightgbm_loader import LightGBMModelDisabledError
from schemas.cluster import ClusterAnomalyRequest
from schemas.detection import (
    BrowserDetectionResult,
    FinalDecision,
    PersonaDetectionResult,
    UnifiedDetectionRequest,
    UnifiedDetectionResponse,
)
from services.cluster_service import ClusterDetectionService
from services.detection_service import DetectionResult, DetectionService
from utils.training_logger import log_detection_sample

router = APIRouter()


def _build_cluster_request(request: UnifiedDetectionRequest) -> ClusterAnomalyRequest:
    persona = request.persona_features
    purchase = persona.purchase
    return ClusterAnomalyRequest(
        age=persona.age,
        gender=persona.gender,
        prefecture=persona.prefecture,
        product_category=purchase.product_category,
        quantity=purchase.quantity,
        price=int(purchase.price),
        total_amount=int(purchase.total_amount),
        purchase_time=purchase.purchase_time,
        limited_flag=purchase.limited_flag,
        payment_method=purchase.payment_method,
        manufacturer=purchase.manufacturer,
    )


@router.post("/detect", response_model=UnifiedDetectionResponse)
async def detect_agent(
    request: UnifiedDetectionRequest,
    detection_service: DetectionService = Depends(get_detection_service),
    cluster_service: ClusterDetectionService = Depends(get_cluster_service),
) -> UnifiedDetectionResponse:
    """ブラウザ行動と購入情報を統合した判定を行う。"""
    browser_result: DetectionResult | None = None
    try:
        browser_result = detection_service.predict(request)
    except LightGBMModelDisabledError as exc:
        placeholder_result = DetectionResult(
            session_id=request.session_id or "",
            score=0.0,
            is_bot=False,
            confidence=0.0,
            request_id=request.request_id or "",
            features_extracted={},
            raw_prediction=0.0,
        )
        log_detection_sample(
            request=request,
            browser_result=placeholder_result,
            persona_result=PersonaDetectionResult(is_provided=False),
            final_decision=FinalDecision(is_bot=False, reason="browser_model_disabled", recommendation="allow"),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"検知処理中にエラーが発生しました: {exc}") from exc

    persona_result = PersonaDetectionResult(is_provided=False)

    persona_flagged = False
    if request.persona_features:
        try:
            cluster_request = _build_cluster_request(request)
            cluster_prediction = cluster_service.predict(cluster_request)
            persona_result = PersonaDetectionResult(
                is_provided=True,
                cluster_id=cluster_prediction.cluster_id,
                prediction=cluster_prediction.prediction,
                anomaly_score=cluster_prediction.anomaly_score,
                threshold=cluster_prediction.threshold,
                is_anomaly=cluster_prediction.is_anomaly,
            )
            persona_flagged = cluster_prediction.is_anomaly
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:  # pragma: no cover
            raise HTTPException(
                status_code=500, detail=f"クラスタ異常検知処理中にエラーが発生しました: {exc}"
            ) from exc

    is_bot = browser_result.is_bot or persona_flagged

    if persona_flagged:
        reason = "persona_anomaly"
        recommendation = "challenge"
    elif browser_result.is_bot:
        reason = "browser_behavior"
        recommendation = "challenge"
    else:
        reason = "normal"
        recommendation = "allow"

    final_decision = FinalDecision(
        is_bot=is_bot,
        reason=reason,
        recommendation=recommendation,
    )

    response = UnifiedDetectionResponse(
        session_id=browser_result.session_id,
        request_id=browser_result.request_id,
        browser_detection=BrowserDetectionResult(
            score=browser_result.score,
            is_bot=browser_result.is_bot,
            confidence=browser_result.confidence,
            raw_prediction=browser_result.raw_prediction,
            features_extracted=browser_result.features_extracted,
        ),
        persona_detection=persona_result,
        final_decision=final_decision,
    )
    log_detection_sample(
        request=request,
        browser_result=browser_result,
        persona_result=persona_result,
        final_decision=final_decision,
    )
    return response
