"""統合データを扱うAIエージェント検知 API スキーマ。"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class MouseMovement(BaseModel):
    timestamp: int
    x: float
    y: float
    velocity: float


class ClickEvent(BaseModel):
    timestamp: int
    x: float
    y: float
    target: Optional[str] = None
    doubleClick: Optional[bool] = Field(None, alias="double_click")


class KeyEvent(BaseModel):
    timestamp: int
    key: str
    holdTime: Optional[float] = Field(None, alias="hold_time")
    isModifier: bool = Field(..., alias="is_modifier")


class ScrollEvent(BaseModel):
    timestamp: int
    scrollTop: float = Field(..., alias="scroll_top")
    scrollLeft: float = Field(..., alias="scroll_left")
    speed: float


class BehavioralClickPatterns(BaseModel):
    avg_click_interval: float
    click_precision: float
    double_click_rate: float


class BehavioralKeystrokeDynamics(BaseModel):
    typing_speed_cpm: float
    key_hold_time_ms: float
    key_interval_variance: float


class BehavioralScrollBehavior(BaseModel):
    scroll_speed: float
    scroll_acceleration: float
    pause_frequency: float


class BehavioralPageInteraction(BaseModel):
    session_duration_ms: float
    page_dwell_time_ms: float
    first_interaction_delay_ms: Optional[float] = None
    navigation_pattern: Optional[str] = None
    form_fill_speed_cpm: Optional[float] = None
    paste_ratio: Optional[float] = None


class BehavioralData(BaseModel):
    mouse_movements: List[MouseMovement]
    click_patterns: BehavioralClickPatterns
    keystroke_dynamics: BehavioralKeystrokeDynamics
    scroll_behavior: BehavioralScrollBehavior
    page_interaction: BehavioralPageInteraction


class BrowserInfo(BaseModel):
    name: str
    version: str
    os: str
    engine: str
    is_chromium_based: bool
    is_chrome: bool
    is_pure_chromium: bool


class DeviceFingerprint(BaseModel):
    screen_resolution: str
    timezone: str
    user_agent: str
    user_agent_hash: str
    user_agent_brands: List[str]
    vendor: str
    app_version: str
    platform: str
    browser_info: BrowserInfo
    canvas_fingerprint: str
    webgl_fingerprint: str
    http_signature_state: Optional[str] = None
    anti_fingerprint_signals: Optional[List[str]] = None
    network_fingerprint_source: Optional[str] = None
    tls_ja4: Optional[str] = None
    http_signature: Optional[str] = None


class BehaviorEvent(BaseModel):
    action: str
    timestamp: int
    velocity: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None
    button: Optional[int] = None
    key: Optional[str] = None
    delta_x: Optional[float] = Field(
        None,
        alias="delta_x",
        validation_alias=AliasChoices("delta_x", "deltaX"),
    )
    delta_y: Optional[float] = Field(
        None,
        alias="delta_y",
        validation_alias=AliasChoices("delta_y", "deltaY"),
    )


class PersonaPurchaseData(BaseModel):
    product_category: int
    quantity: int
    price: float
    total_amount: float
    purchase_time: int
    limited_flag: int
    payment_method: int
    manufacturer: int


class PersonaFeatures(BaseModel):
    age: int
    gender: int
    prefecture: int
    purchase: PersonaPurchaseData


class UnifiedDetectionRequest(BaseModel):
    """ブラウザ行動と購入情報を統合した検知リクエスト。"""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    session_id: Optional[str] = Field(
        None, alias="session_id", validation_alias=AliasChoices("session_id", "sessionId")
    )
    request_id: Optional[str] = Field(
        None,
        alias="request_id",
        validation_alias=AliasChoices("request_id", "requestId"),
    )
    timestamp: Optional[int] = None
    behavioral_data: BehavioralData = Field(..., alias="behavioral_data")
    behavior_sequence: List[BehaviorEvent] = Field(
        ...,
        alias="behavior_sequence",
        validation_alias=AliasChoices("behavior_sequence", "recent_actions"),
    )
    device_fingerprint: DeviceFingerprint = Field(..., alias="device_fingerprint")
    persona_features: Optional[PersonaFeatures] = Field(None, alias="persona_features")
    context: Optional[Dict[str, Any]] = Field(
        None,
        alias="context",
        validation_alias=AliasChoices("context", "contextData"),
    )


class BrowserDetectionResult(BaseModel):
    score: float
    is_bot: bool
    confidence: float
    raw_prediction: float
    features_extracted: Dict[str, float]


class PersonaDetectionResult(BaseModel):
    is_provided: bool
    cluster_id: Optional[int] = None
    prediction: Optional[int] = None
    anomaly_score: Optional[float] = None
    threshold: Optional[float] = None
    is_anomaly: Optional[bool] = None


class FinalDecision(BaseModel):
    is_bot: bool
    reason: str
    recommendation: str


class UnifiedDetectionResponse(BaseModel):
    session_id: str
    request_id: str
    browser_detection: BrowserDetectionResult
    persona_detection: PersonaDetectionResult
    final_decision: FinalDecision
