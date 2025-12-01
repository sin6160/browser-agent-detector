import { BehaviorEventBus } from './behavior-event-bus';
import {
  ClickEvent,
  CollectorState,
  KeyEvent,
  MouseMovement,
  RecentAction,
  ScrollEvent,
} from './types';

export interface EventCollectorOptions {
  maxRecentActions?: number;
}

const DEFAULTS = {
  maxRecentActions: 120,
  mouseBuffer: 1000,
  clickBuffer: 100,
  keyBuffer: 500,
  scrollBuffer: 100,
};

export class EventCollector {
  private readonly bus: BehaviorEventBus;
  private readonly options: Required<EventCollectorOptions>;
  private initialized = false;
  private cleanupFns: Array<() => void> = [];
  private intervalIds: Array<ReturnType<typeof setInterval>> = [];

  private pageLoadTime = Date.now();
  private firstInteractionTime: number | null = null;
  private firstInteractionDelay: number | null = null;
  private lastClickTime: number | null = null;
  private lastMousePosition: { x: number; y: number } | null = null;
  private lastScrollPosition: { top: number; left: number } = { top: 0, left: 0 };
  private lastScrollTime: number | null = null;
  private scrollPauses = 0;
  private scrollTotal = 0;
  private totalClickCount = 0;
  private doubleClickCount = 0;
  private pasteEvents = 0;
  private inputEvents = 0;
  private formInteractions = 0;
  private sessionId = `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  private mouseEvents: MouseMovement[] = [];
  private clickEvents: ClickEvent[] = [];
  private keyEvents: KeyEvent[] = [];
  private keyPressMap: Map<string, number> = new Map();
  private scrollEvents: ScrollEvent[] = [];
  private recentActions: RecentAction[] = [];
  private mouseRecentSampleCounter = 0;

  constructor(bus: BehaviorEventBus, options?: EventCollectorOptions) {
    this.bus = bus;
    this.options = {
      maxRecentActions: options?.maxRecentActions ?? DEFAULTS.maxRecentActions,
    };
  }

  start() {
    if (this.initialized || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const addListener = (
      target: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      target.addEventListener(type, listener as EventListener, options);
      this.cleanupFns.push(() => target.removeEventListener(type, listener as EventListener, options));
    };

    const ensureFirstInteraction = (ts: number) => {
      if (this.firstInteractionTime === null) {
        this.firstInteractionTime = ts;
        this.firstInteractionDelay = ts - this.pageLoadTime;
      }
    };

    // Mouse move
    let mouseThrottle: ReturnType<typeof setTimeout> | null = null;
    addListener(document, 'mousemove', (event: Event) => {
      if (mouseThrottle) {
        return;
      }
      mouseThrottle = setTimeout(() => {
        mouseThrottle = null;
        const e = event as MouseEvent;
        const now = Date.now();
        ensureFirstInteraction(now);

        let velocity = 0;
        if (this.lastMousePosition) {
          const dx = e.clientX - this.lastMousePosition.x;
          const dy = e.clientY - this.lastMousePosition.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const prevTimestamp = this.mouseEvents[this.mouseEvents.length - 1]?.timestamp ?? now;
          const elapsed = now - prevTimestamp || 1;
          velocity = distance / elapsed;
        }

        const movement: MouseMovement = {
          timestamp: now,
          x: e.clientX,
          y: e.clientY,
          velocity,
        };
        this.mouseEvents.push(movement);
        if (this.mouseEvents.length > DEFAULTS.mouseBuffer) {
          this.mouseEvents.shift();
        }
        this.lastMousePosition = { x: e.clientX, y: e.clientY };

        // Downsampled mouse movement into recent_actions (約5Hz)
        this.mouseRecentSampleCounter += 1;
        if (this.mouseRecentSampleCounter % 4 === 0) {
          this.recordRecentAction('mouse_move', { x: e.clientX, y: e.clientY });
        }
      }, 50);
    });

    // Click
    addListener(document, 'click', (event: Event) => {
      const e = event as MouseEvent;
      const now = Date.now();
      ensureFirstInteraction(now);
      const isDoubleClick =
        this.lastClickTime !== null && now - this.lastClickTime < 500;
      if (isDoubleClick) {
        this.doubleClickCount++;
      }
      const target =
        e.target instanceof HTMLElement
          ? `${e.target.tagName}${e.target.id ? `#${e.target.id}` : ''}`
          : 'unknown';
      const click: ClickEvent = {
        timestamp: now,
        x: e.clientX,
        y: e.clientY,
        target,
        doubleClick: isDoubleClick,
      };
      this.clickEvents.push(click);
      if (this.clickEvents.length > DEFAULTS.clickBuffer) {
        this.clickEvents.shift();
      }
      this.lastClickTime = now;
      this.totalClickCount++;
      this.recordRecentAction('click', { target });
    });

    // Keydown / keyup
    addListener(document, 'keydown', (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.target instanceof HTMLInputElement && e.target.type === 'password') {
        return;
      }
      const now = Date.now();
      ensureFirstInteraction(now);
      this.keyPressMap.set(e.key, now);
      const isModifier = ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key);
      const keyEvent: KeyEvent = {
        timestamp: now,
        key: e.key,
        isModifier,
      };
      this.keyEvents.push(keyEvent);
      if (this.keyEvents.length > DEFAULTS.keyBuffer) {
        this.keyEvents.shift();
      }
    });

    addListener(document, 'keyup', (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.target instanceof HTMLInputElement && e.target.type === 'password') {
        return;
      }
      const downTime = this.keyPressMap.get(e.key);
      if (downTime) {
        const holdTime = Date.now() - downTime;
        const idx = this.keyEvents.findIndex(
          (evt) => evt.key === e.key && evt.timestamp === downTime,
        );
        if (idx >= 0) {
          this.keyEvents[idx].holdTime = holdTime;
        }
        this.keyPressMap.delete(e.key);
      }
    });

    // Scroll
    let scrollThrottle: ReturnType<typeof setTimeout> | null = null;
    addListener(document, 'scroll', () => {
      if (scrollThrottle) return;
      scrollThrottle = setTimeout(() => {
        scrollThrottle = null;
        const now = Date.now();
        ensureFirstInteraction(now);
        const scrollTop = window.scrollY;
        const scrollLeft = window.scrollX;
        let speed = 0;
        if (this.lastScrollTime !== null) {
          const diffTop = Math.abs(scrollTop - this.lastScrollPosition.top);
          const diffLeft = Math.abs(scrollLeft - this.lastScrollPosition.left);
          const diff = Math.sqrt(diffTop * diffTop + diffLeft * diffLeft);
          const elapsed = now - this.lastScrollTime;
          speed = elapsed > 0 ? diff / elapsed : 0;
          if (diff === 0 && elapsed > 500) {
            this.scrollPauses++;
          }
          this.scrollTotal++;
        }
        const scrollEvent: ScrollEvent = {
          timestamp: now,
          scrollTop,
          scrollLeft,
          speed,
        };
        this.scrollEvents.push(scrollEvent);
        if (this.scrollEvents.length > DEFAULTS.scrollBuffer) {
          this.scrollEvents.shift();
        }
        this.lastScrollPosition = { top: scrollTop, left: scrollLeft };
        this.lastScrollTime = now;
      }, 100);
    });

    // Paste / input detection
    addListener(document, 'beforeinput', (event: Event) => {
      const e = event as InputEvent;
      this.inputEvents++;
      if (e.inputType === 'insertFromPaste') {
        this.pasteEvents++;
        this.recordRecentAction('paste');
      }
    });

    // Form focus/blur
    addListener(
      document,
      'focus',
      (event: Event) => {
        const target = event.target as Element | null;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          if (target instanceof HTMLInputElement && target.type === 'password') {
            return;
          }
          this.formInteractions++;
          this.recordRecentAction('focus', { id: target.id });
        }
      },
      true,
    );

    addListener(
      document,
      'blur',
      (event: Event) => {
        const target = event.target as Element | null;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          if (target instanceof HTMLInputElement && target.type === 'password') {
            return;
          }
          this.recordRecentAction('blur', { id: target.id });
        }
      },
      true,
    );

    // page visibility change -> action
    addListener(document, 'visibilitychange', () => {
      this.recordRecentAction(document.visibilityState);
    });

    this.initialized = true;
  }

  stop() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.intervalIds.forEach((id) => clearInterval(id));
    this.intervalIds = [];
    this.initialized = false;
  }

  recordRecentAction(action: string, metadata?: Record<string, unknown>) {
    const entry: RecentAction = {
      action,
      timestamp: Date.now(),
      metadata,
    };
    this.recentActions.push(entry);
    if (this.recentActions.length > this.options.maxRecentActions) {
      this.recentActions.shift();
    }
    this.bus.emit({ type: 'action', payload: { action, timestamp: entry.timestamp } });
  }

  getRecentActions(limit = this.options.maxRecentActions): RecentAction[] {
    return this.recentActions.slice(-limit);
  }

  getState(): CollectorState {
    return {
      pageLoadTime: this.pageLoadTime,
      firstInteractionTime: this.firstInteractionTime,
      firstInteractionDelay: this.firstInteractionDelay,
      mouseEvents: [...this.mouseEvents],
      clickEvents: [...this.clickEvents],
      keyEvents: [...this.keyEvents],
      scrollEvents: [...this.scrollEvents],
      scrollPauses: this.scrollPauses,
      scrollTotal: this.scrollTotal,
      totalClickCount: this.totalClickCount,
      doubleClickCount: this.doubleClickCount,
      pasteEvents: this.pasteEvents,
      inputEvents: this.inputEvents,
      formInteractions: this.formInteractions,
      sessionId: this.sessionId,
      recentActions: [...this.recentActions],
    };
  }
}
