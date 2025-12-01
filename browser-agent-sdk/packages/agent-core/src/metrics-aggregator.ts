import { BehavioralData, CollectorState, ClickEvent, KeyEvent, ScrollEvent } from './types';

// Keep a longer window so 1〜2分程度の手動操作が残る
const MAX_MOUSE_EVENTS = 200;

export class MetricsAggregator {
  compute(state: CollectorState): BehavioralData {
    const clickStats = this.computeClickStats(state.clickEvents, state.totalClickCount, state.doubleClickCount);
    const keyStats = this.computeKeyStats(state.keyEvents);
    const scrollStats = this.computeScrollStats(state.scrollEvents, state.scrollPauses, state.scrollTotal);

    const sessionDurationMs = Math.max(Date.now() - state.pageLoadTime, 0);
    const minutesSinceLoad = sessionDurationMs > 0 ? sessionDurationMs / 60000 : 0;
    const formFillSpeedCpm = minutesSinceLoad > 0 ? state.formInteractions / minutesSinceLoad : 0;
    const inputEvents = Math.max(state.inputEvents, 0);
    const pasteRatio = inputEvents > 0 ? state.pasteEvents / inputEvents : 0;

    return {
      mouse_movements: state.mouseEvents.slice(-MAX_MOUSE_EVENTS),
      click_patterns: {
        avg_click_interval: clickStats.avgInterval,
        click_precision: clickStats.precision,
        double_click_rate: clickStats.doubleClickRate,
      },
      keystroke_dynamics: {
        typing_speed_cpm: keyStats.typingSpeedCpm,
        key_hold_time_ms: keyStats.avgHoldTimeMs,
        key_interval_variance: keyStats.intervalVariance,
      },
      scroll_behavior: {
        scroll_speed: scrollStats.averageSpeed,
        scroll_acceleration: scrollStats.acceleration,
        pause_frequency: scrollStats.pauseFrequency,
      },
      page_interaction: {
        session_duration_ms: sessionDurationMs,
        page_dwell_time_ms: sessionDurationMs,
        first_interaction_delay_ms: state.firstInteractionDelay ?? null,
        navigation_pattern: 'linear',
        form_fill_speed_cpm: formFillSpeedCpm,
        paste_ratio: pasteRatio,
      },
    };
  }

  private computeClickStats(clicks: ClickEvent[], totalClickCount: number, doubleClickCount: number) {
    if (!clicks.length) {
      return { avgInterval: 0, precision: 0, doubleClickRate: 0 };
    }

    const timestamps = clicks.map((event) => event.timestamp).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i += 1) {
      const diff = timestamps[i] - timestamps[i - 1];
      if (diff >= 0) {
        intervals.push(diff);
      }
    }
    const avgInterval = intervals.length
      ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
      : 0;

    const targetCounts = new Map<string, number>();
    clicks.forEach((event) => {
      const current = targetCounts.get(event.target) ?? 0;
      targetCounts.set(event.target, current + 1);
    });
    const dominantTargetClicks = Math.max(...Array.from(targetCounts.values()));
    const precision = totalClickCount > 0 ? dominantTargetClicks / totalClickCount : 0;

    return {
      avgInterval,
      precision,
      doubleClickRate: totalClickCount > 0 ? doubleClickCount / totalClickCount : 0,
    };
  }

  private computeKeyStats(keyEvents: KeyEvent[]) {
    const typingEvents = keyEvents.filter((event) => !event.isModifier);
    if (!typingEvents.length) {
      return { typingSpeedCpm: 0, avgHoldTimeMs: 0, intervalVariance: 0 };
    }

    const firstTimestamp = typingEvents[0].timestamp;
    const lastTimestamp = typingEvents[typingEvents.length - 1].timestamp;
    const durationMinutes = lastTimestamp > firstTimestamp ? (lastTimestamp - firstTimestamp) / 60000 : 0;
    const typingSpeedCpm = durationMinutes > 0 ? typingEvents.length / durationMinutes : typingEvents.length * 60;

    const holdTimes = typingEvents
      .map((event) => event.holdTime)
      .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
    const avgHoldTimeMs =
      holdTimes.length > 0 ? holdTimes.reduce((sum, time) => sum + time, 0) / holdTimes.length : 0;

    const timestamps = typingEvents.map((event) => event.timestamp);
    const intervalVariance = this.computeVariance(timestamps);

    return { typingSpeedCpm, avgHoldTimeMs, intervalVariance };
  }

  private computeScrollStats(events: ScrollEvent[], scrollPauses: number, scrollTotal: number) {
    if (!events.length) {
      return { averageSpeed: 0, acceleration: 0, pauseFrequency: 0 };
    }

    const speeds = events
      .map((event) => (Number.isFinite(event.speed) && event.speed >= 0 ? event.speed : 0))
      .filter((speed) => speed >= 0);
    const averageSpeed = speeds.length ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : 0;

    let accelerationSum = 0;
    for (let i = 1; i < speeds.length; i += 1) {
      accelerationSum += Math.abs(speeds[i] - speeds[i - 1]);
    }
    const acceleration = speeds.length > 1 ? accelerationSum / (speeds.length - 1) : 0;

    const pauseFrequency = scrollTotal > 0 ? scrollPauses / scrollTotal : 0;
    return { averageSpeed, acceleration, pauseFrequency };
  }

  private computeVariance(timestamps: number[]): number {
    if (timestamps.length < 2) {
      return 0;
    }
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i += 1) {
      const diff = timestamps[i] - timestamps[i - 1];
      if (diff >= 0) {
        intervals.push(diff);
      }
    }
    if (!intervals.length) {
      return 0;
    }
    const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const squaredDiffs = intervals.map((interval) => (interval - average) ** 2);
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / intervals.length;
  }
}
