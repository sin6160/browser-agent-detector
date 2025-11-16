import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getAIDetectorServerConfig } from '@/app/lib/server/ai-detector';
import {
  buildUnifiedDetectionRequest,
  SecurityApiClient,
  UnifiedDetectionResponse,
  extractNetworkFingerprint,
} from '@browser-agent-sdk/node-bridge';
import { BehaviorSnapshot } from '@browser-agent-sdk/agent-core';

const LOG_PATH = path.join(process.cwd(), 'logs', 'security.log');

async function appendSecurityLog(entry: Record<string, unknown>) {
  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  } catch (error) {
    console.error('security log append error', error);
  }
}

function collectRequestHeaders(request: NextRequest, extra: Record<string, string> = {}) {
  const keys = ['user-agent', 'referer', 'x-forwarded-for', 'sec-ch-ua', 'sec-ch-ua-platform'];
  const headers: Record<string, string> = {};
  keys.forEach((key) => {
    const value = request.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  });
  return { ...headers, ...extra };
}

function translateResponse(response: UnifiedDetectionResponse, snapshot?: BehaviorSnapshot) {
  return {
    botScore: response.bot_score,
    humanScore: response.human_score,
    riskLevel: response.risk_level,
    recommendation: response.recommendation,
    reasons: response.reasons ?? [],
    detectionId: response.detection_id,
    context: snapshot?.context,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { endpoint, apiKey } = getAIDetectorServerConfig();
    const snapshot = (await request.json()) as BehaviorSnapshot;

    const sessionId =
      request.cookies.get('ec_session')?.value || snapshot.sessionId || 'session_unknown';
    const ipAddress =
      request.ip || request.headers.get('x-forwarded-for') || 'ip_unknown';
    const requestId =
      (globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`) as string;

    const networkFingerprint = extractNetworkFingerprint({ headers: request.headers });

    const hasHttpSignature = networkFingerprint.http_signature && networkFingerprint.http_signature !== 'missing';
    const enrichedSnapshot: BehaviorSnapshot = {
      ...snapshot,
      deviceFingerprint: {
        ...snapshot.deviceFingerprint,
        tls_ja4: networkFingerprint.tls_ja4,
        http_signature: networkFingerprint.http_signature,
        http_signature_state: hasHttpSignature ? 'valid' : 'missing',
        network_fingerprint_source: 'server',
      },
    };

    const unifiedRequest = buildUnifiedDetectionRequest(enrichedSnapshot, {
      sessionId,
      ipAddress,
      requestId,
      headers: collectRequestHeaders(request, networkFingerprint.header_sample),
      siteId: snapshot.context?.siteId,
      network: networkFingerprint,
    });

    const client = new SecurityApiClient({ endpoint, apiKey });

    const detectorResponse = await client.detect(unifiedRequest);
    if (detectorResponse.reasons?.some((reason) => reason.factor === 'fail_open')) {
      throw new Error('ai-detector unavailable (fail-open fallback detected)');
    }

    appendSecurityLog({
      requestId,
      sessionId: unifiedRequest.session_id,
      timestamp: Date.now(),
      request: unifiedRequest,
      response: detectorResponse,
    }).catch((error) => console.error('security log error', error));

    return NextResponse.json(translateResponse(detectorResponse, snapshot));
  } catch (error) {
    console.error('AI detector route error', error);
    return NextResponse.json(
      { error: 'AI detector processing failed' },
      { status: 500 },
    );
  }
}
