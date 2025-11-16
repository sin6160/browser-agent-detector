export interface MouseMovement {
  timestamp: number;
  x: number;
  y: number;
  velocity: number;
}

export interface ClickEvent {
  timestamp: number;
  x: number;
  y: number;
  target: string;
  doubleClick: boolean;
}

export interface KeyEvent {
  timestamp: number;
  key: string;
  holdTime?: number;
  isModifier: boolean;
}

export interface ScrollEvent {
  timestamp: number;
  scrollTop: number;
  scrollLeft: number;
  speed: number;
}

export interface RecentAction {
  action: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface BehavioralData {
  mouse_movements: MouseMovement[];
  click_patterns: {
    avg_click_interval: number;
    click_precision: number;
    double_click_rate: number;
  };
  keystroke_dynamics: {
    typing_speed_cpm: number;
    key_hold_time_ms: number;
    key_interval_variance: number;
  };
  scroll_behavior: {
    scroll_speed: number;
    scroll_acceleration: number;
    pause_frequency: number;
  };
  page_interaction: {
    session_duration_ms: number;
    page_dwell_time_ms: number;
    first_interaction_delay_ms: number | null;
    navigation_pattern: string;
    form_fill_speed_cpm: number;
    paste_ratio: number;
  };
}

export interface BrowserInfo {
  name: string;
  version: string;
  os: string;
  engine: string;
  is_chromium_based: boolean;
  is_chrome: boolean;
  is_pure_chromium: boolean;
}

export interface DeviceFingerprint {
  screen_resolution: string;
  timezone: string;
  user_agent: string;
  user_agent_hash: string;
  user_agent_brands: string[];
  vendor: string;
  app_version: string;
  platform: string;
  browser_info: BrowserInfo;
  canvas_fingerprint: string;
  webgl_fingerprint: string;
  http_signature_state: 'valid' | 'invalid' | 'missing' | 'unknown';
  anti_fingerprint_signals: string[];
  tls_ja4?: string;
  http_signature?: string;
  network_fingerprint_source?: 'client' | 'server';
}

export interface CollectorState {
  pageLoadTime: number;
  firstInteractionTime: number | null;
  firstInteractionDelay: number | null;
  mouseEvents: MouseMovement[];
  clickEvents: ClickEvent[];
  keyEvents: KeyEvent[];
  scrollEvents: ScrollEvent[];
  scrollPauses: number;
  scrollTotal: number;
  totalClickCount: number;
  doubleClickCount: number;
  pasteEvents: number;
  inputEvents: number;
  formInteractions: number;
  sessionId: string;
  recentActions: RecentAction[];
}

export interface SnapshotContext {
  actionType: string;
  url: string;
  siteId?: string;
  pageLoadTime: number;
  firstInteractionTime: number | null;
  firstInteractionDelay: number | null;
  userAgent: string;
  locale?: string;
  extra?: Record<string, unknown>;
}

export interface BehaviorSnapshot {
  sessionId: string;
  requestId: string;
  timestamp: number;
  deviceFingerprint: DeviceFingerprint;
  behavioralData: BehavioralData;
  context: SnapshotContext;
  recent_actions: RecentAction[];
}

export interface BehaviorTrackerOptions {
  transport?: DetectionTransport;
  scheduleIntervalMs?: number;
  maxRecentActions?: number;
  contextResolver?: () => SnapshotContext | Promise<SnapshotContext>;
}

export interface DetectionTransport {
  send(snapshot: BehaviorSnapshot): Promise<void>;
}
