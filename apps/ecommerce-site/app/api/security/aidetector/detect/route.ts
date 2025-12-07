import { NextRequest, NextResponse } from 'next/server';
import { getAIDetectorServerConfig } from '@/app/lib/server/ai-detector';
import { BehaviorSnapshot } from '@browser-agent-sdk/agent-core';

// Edge Runtime で動作させる
export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { endpoint, apiKey } = getAIDetectorServerConfig();
    const detectUrl = `${endpoint.replace(/\/$/, '')}/detect`;
    const snapshot = (await request.json()) as BehaviorSnapshot;

    const sessionId =
      request.cookies.get('ec_session')?.value || snapshot.sessionId || 'session_unknown';
    const ipAddress =
      request.ip || request.headers.get('x-forwarded-for') || 'ip_unknown';
    const requestId = globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;

    // Cloud Run 側の FastAPI スキーマに合わせてキーをスネークケースに整形する
    const payload = {
      session_id: sessionId,
      request_id: requestId,
      timestamp: snapshot.timestamp,
      behavioral_data: snapshot.behavioralData,
      behavior_sequence: snapshot.recent_actions ?? [],
      device_fingerprint: snapshot.deviceFingerprint,
      persona_features: (snapshot as any).persona_features, // 現状未使用だが互換性のため透過
      context: snapshot.context,
      ip_address: ipAddress,
      headers: Object.fromEntries(request.headers),
    };

    const res = await fetch(detectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const detectorResponse = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(`ai-detector responded with ${res.status}`);
    }

    return NextResponse.json(detectorResponse);
  } catch (error) {
    console.error('AI detector route error', error);
    return NextResponse.json(
      { error: 'AI detector processing failed' },
      { status: 500 },
    );
  }
}
