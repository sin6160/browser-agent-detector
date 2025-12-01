'use client';

import React, { useCallback, useMemo } from 'react';
import {
  BehaviorTrackerProvider as SDKBehaviorTrackerProvider,
} from '@browser-agent-sdk/react-adapter';
import { ProxyDetectionTransport } from '@browser-agent-sdk/agent-core';

function updateSecurityBadgeFromResult(result: any) {
  if (typeof window === 'undefined') {
    return;
  }

  const humanScore =
    typeof result?.humanScore === 'number'
      ? result.humanScore
      : typeof result?.human_score === 'number'
        ? result.human_score
        : null;

  const formatted = humanScore !== null ? humanScore.toFixed(3) : '-';

  try {
    localStorage.setItem('aiDetectorScore', formatted);
  } catch {
    // ignore quota errors
  }

  try {
    const recaptchaScore = localStorage.getItem('recaptchaOriginalScore') || '-';
    const clusteringScore = localStorage.getItem('clusteringScore') || '-';
    const clusteringThreshold = localStorage.getItem('clusteringThreshold') || '-';
    const createScoreDisplay = (window as any).createScoreDisplay;
    if (typeof createScoreDisplay === 'function') {
      createScoreDisplay('AI検知スコア', recaptchaScore, formatted, clusteringScore, clusteringThreshold);
    }
  } catch (error) {
    console.error('score badge update error', error);
  }
}

export function BehaviorTrackerProvider({ children }: { children: React.ReactNode }) {
  const handleResult = useCallback((result: any) => {
    updateSecurityBadgeFromResult(result);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aidetector:result', { detail: result }));
    }
  }, []);

  const transport = useMemo(
    () =>
      new ProxyDetectionTransport({
        endpoint: '/api/security/aidetector/detect',
        onResult: handleResult,
      }),
    [handleResult],
  );

  const contextResolver = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        actionType: 'INIT',
        url: 'about:blank',
        siteId: 'ecommerce-site',
        pageLoadTime: Date.now(),
        firstInteractionTime: null,
        firstInteractionDelay: null,
        userAgent: 'server',
        locale: 'en-US',
      };
    }

    return {
      actionType: 'INIT',
      url: window.location.href,
      siteId: window.location.hostname,
      pageLoadTime: performance.timing?.navigationStart ?? Date.now(),
      firstInteractionTime: null,
      firstInteractionDelay: null,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };
  }, []);

  return (
    <SDKBehaviorTrackerProvider
      transport={transport}
      options={{
        scheduleIntervalMs: 5000,
        contextResolver,
      }}
    >
      {children}
    </SDKBehaviorTrackerProvider>
  );
}

export { useBehaviorTracker } from '@browser-agent-sdk/react-adapter';
