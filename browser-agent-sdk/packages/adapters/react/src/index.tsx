'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BehaviorSnapshot,
  BehaviorTrackerFacade,
  BehaviorTrackerOptions,
  DetectionTransport,
  ProxyDetectionTransport,
} from '@browser-agent-sdk/agent-core';

export interface BehaviorTrackerProviderProps {
  children: React.ReactNode;
  transport?: DetectionTransport;
  transportEndpoint?: string;
  options?: Omit<BehaviorTrackerOptions, 'transport'>;
  onSnapshot?: (snapshot: BehaviorSnapshot) => void;
}

const BehaviorTrackerContext = createContext<BehaviorTrackerFacade | null>(null);

export function BehaviorTrackerProvider({
  children,
  transport,
  transportEndpoint = '/api/security/aidetector/detect',
  options,
  onSnapshot,
}: BehaviorTrackerProviderProps) {
  const trackerRef = useRef<BehaviorTrackerFacade | null>(null);

  if (!trackerRef.current) {
    const finalTransport =
      transport ?? new ProxyDetectionTransport({ endpoint: transportEndpoint });
    trackerRef.current = new BehaviorTrackerFacade({
      ...options,
      transport: finalTransport,
    });
  }

  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    tracker.init();
    const unsubscribe =
      onSnapshot && tracker.subscribe((event) => event.type === 'snapshot' && onSnapshot(event.payload));
    return () => {
      unsubscribe?.();
      tracker.destroy();
    };
  }, [onSnapshot]);

  const value = useMemo(() => trackerRef.current, []);

  return (
    <BehaviorTrackerContext.Provider value={value}>
      {children}
    </BehaviorTrackerContext.Provider>
  );
}

export function useBehaviorTracker(): BehaviorTrackerFacade {
  const tracker = useContext(BehaviorTrackerContext);
  if (!tracker) {
    throw new Error('useBehaviorTracker must be used within BehaviorTrackerProvider');
  }
  return tracker;
}

export interface DetectionOutcome {
  allowed: boolean;
  botScore: number;
  needsChallenge: boolean;
  token?: string;
}

export interface TimedScores {
  short: number | null;
  medium: number | null;
  long: number | null;
}

export interface UseAIDetectorEngineOptions {
  enabled?: boolean;
  timerDurations?: Partial<Record<'short' | 'medium' | 'long', number>>;
  challengeThreshold?: number;
  blockThreshold?: number;
  waitTimeoutMs?: number;
}

const DEFAULT_TIMER_DURATIONS = {
  short: 500,
  medium: 2000,
  long: 5000,
} as const;

export function useAIDetectorEngine(
  options: UseAIDetectorEngineOptions = {},
): { checkDetection: (action: string) => Promise<DetectionOutcome>; timedScores: TimedScores } {
  const {
    enabled = true,
    timerDurations = {},
    challengeThreshold = 0.6,
    blockThreshold = 0.85,
    waitTimeoutMs = 5000,
  } = options;

  const tracker = useBehaviorTracker();
  const [timedScores, setTimedScores] = useState<TimedScores>({
    short: null,
    medium: null,
    long: null,
  });

  const timersRef = useRef<{
    shortTimer: ReturnType<typeof setTimeout> | null;
    mediumTimer: ReturnType<typeof setTimeout> | null;
    longTimer: ReturnType<typeof setTimeout> | null;
    isExecuting: boolean;
  }>({
    shortTimer: null,
    mediumTimer: null,
    longTimer: null,
    isExecuting: false,
  });

  const clearTimers = useCallback(() => {
    if (timersRef.current.shortTimer) clearTimeout(timersRef.current.shortTimer);
    if (timersRef.current.mediumTimer) clearTimeout(timersRef.current.mediumTimer);
    if (timersRef.current.longTimer) clearTimeout(timersRef.current.longTimer);
    timersRef.current.shortTimer = null;
    timersRef.current.mediumTimer = null;
    timersRef.current.longTimer = null;
  }, []);

  const waitForDetectionResult = useCallback(
    (action: string): Promise<DetectionOutcome> => {
      const fallback: DetectionOutcome = { allowed: true, botScore: 0, needsChallenge: false };
      if (typeof window === 'undefined') {
        return Promise.resolve(fallback);
      }

      return new Promise((resolve) => {
        const timeoutId = window.setTimeout(() => {
          window.removeEventListener('aidetector:result', handler as EventListener);
          resolve(fallback);
        }, waitTimeoutMs);

        const handler = (event: Event) => {
          const customEvent = event as CustomEvent<any>;
          const detail = customEvent.detail || {};
          const detailAction = detail?.context?.actionType;
          if (detailAction && detailAction !== action) {
            return;
          }

          clearTimeout(timeoutId);
          window.removeEventListener('aidetector:result', handler as EventListener);

          const botScore =
            typeof detail?.botScore === 'number'
              ? detail.botScore
              : typeof detail?.bot_score === 'number'
                ? detail.bot_score
                : 0;
          const recommendationRaw = detail?.recommendation;
          const recommendation =
            typeof recommendationRaw === 'string'
              ? recommendationRaw
              : recommendationRaw?.toString?.() ?? 'allow';
          const normalized = recommendation.toLowerCase() as 'allow' | 'challenge' | 'block';
          const allowed = normalized !== 'block' && botScore < blockThreshold;
          const needsChallenge =
            normalized === 'challenge' || botScore >= challengeThreshold;

          resolve({
            allowed,
            botScore,
            needsChallenge,
            token: detail?.detectionId || detail?.detection_id,
          });
        };

        window.addEventListener('aidetector:result', handler as EventListener);
      });
    },
    [blockThreshold, challengeThreshold, waitTimeoutMs],
  );

  const triggerDetection = useCallback(
    async (action: string): Promise<DetectionOutcome> => {
      if (!enabled) {
        return { allowed: true, botScore: 0, needsChallenge: false };
      }

      const resultPromise = waitForDetectionResult(action);

      try {
        await tracker.captureCriticalAction(action);
      } catch (error) {
        console.error('captureCriticalAction error', error);
      }

      return resultPromise;
    },
    [enabled, tracker, waitForDetectionResult],
  );

  const checkDetection = useCallback(
    (action: string) => triggerDetection(action),
    [triggerDetection],
  );

  const executeTimedDetection = useCallback(
    async (timerType: 'short' | 'medium' | 'long') => {
      if (timersRef.current.isExecuting) {
        return;
      }

      timersRef.current.isExecuting = true;
      try {
        const result = await triggerDetection(`TIMED_${timerType.toUpperCase()}`);
        if (typeof result.botScore === 'number') {
          setTimedScores((prev) => ({
            ...prev,
            [timerType]: result.botScore,
          }));
        }
      } catch (error) {
        console.error(`${timerType} detection error`, error);
      } finally {
        timersRef.current.isExecuting = false;
      }
    },
    [triggerDetection],
  );

  const setupTimers = useCallback(() => {
    clearTimers();
    if (!enabled) {
      return;
    }

    const durations = {
      short: timerDurations.short ?? DEFAULT_TIMER_DURATIONS.short,
      medium: timerDurations.medium ?? DEFAULT_TIMER_DURATIONS.medium,
      long: timerDurations.long ?? DEFAULT_TIMER_DURATIONS.long,
    };

    const assignTimer = (
      timerType: 'short' | 'medium' | 'long',
      id: ReturnType<typeof setTimeout>,
    ) => {
      if (timerType === 'short') {
        timersRef.current.shortTimer = id;
      } else if (timerType === 'medium') {
        timersRef.current.mediumTimer = id;
      } else {
        timersRef.current.longTimer = id;
      }
    };

    (['short', 'medium', 'long'] as const).forEach((timerType) => {
      const delay = durations[timerType];
      assignTimer(
        timerType,
        setTimeout(() => executeTimedDetection(timerType), delay),
      );
    });
  }, [clearTimers, enabled, executeTimedDetection, timerDurations.long, timerDurations.medium, timerDurations.short]);

  useEffect(() => {
    setupTimers();
    return () => {
      clearTimers();
    };
  }, [setupTimers, clearTimers]);

  useEffect(() => {
    if (!enabled) {
      setTimedScores({ short: null, medium: null, long: null });
    }
  }, [enabled]);

  return { checkDetection, timedScores };
}
