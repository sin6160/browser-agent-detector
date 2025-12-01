# 導入手順書（外部サイト向け）

本書は **AI 検知サーバーがすでに稼働している** 前提で、公開レポジトリとしての `browser-agent-sdk` を用い、外部の Web サイトに行動トラッキングと AI 検知を組み込むための手順をまとめます。サーバーの API 仕様は `docs/API-doc.md` を参照してください。

## 前提条件
- Node.js 18 以上（フロント/バック統一推奨）
- `pnpm` もしくは `npm`（例: `npm install -g pnpm`）
- 取得済みの AI 検知サーバー情報  
  - `AI_DETECTOR_ENDPOINT_URL`（例: `https://detector.example.com`）  
  - `AI_DETECTOR_API_KEY`（Bearer トークン）
- reCAPTCHA Enterprise を併用する場合は `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` などを別途準備

## 1. SDK のインストール
プロジェクトのルートで以下を実行します。
```bash
pnpm add @browser-agent-sdk/react-adapter @browser-agent-sdk/agent-core @browser-agent-sdk/node-bridge
# npm を使う場合: npm install <同上>
```

## 2. クライアント側の組み込み
ブラウザの行動データを 5 秒ごとにサーバーへ送信する例（React）。

```tsx
// app/providers/BehaviorTrackerProvider.tsx など
'use client';

import React, { useMemo, useCallback } from 'react';
import { BehaviorTrackerProvider as SDKBehaviorTrackerProvider } from '@browser-agent-sdk/react-adapter';
import { ProxyDetectionTransport } from '@browser-agent-sdk/agent-core';

export function BehaviorTrackerProvider({ children }: { children: React.ReactNode }) {
  const handleResult = useCallback((result: any) => {
    // スコアを UI に反映する処理を任意で実装
    window.dispatchEvent(new CustomEvent('aidetector:result', { detail: result }));
  }, []);

  const transport = useMemo(
    () =>
      new ProxyDetectionTransport({
        endpoint: '/api/security/aidetector/detect', // 自サイトの API ルートへ中継
        onResult: handleResult,
      }),
    [handleResult],
  );

  return (
    <SDKBehaviorTrackerProvider
      transport={transport}
      options={{ scheduleIntervalMs: 5000 }}
    >
      {children}
    </SDKBehaviorTrackerProvider>
  );
}
```

アプリ全体をこの Provider でラップすれば、行動スナップショットが自動的にサーバーへ送られます。

## 3. サーバー側（API ルート）の中継設定
`SecurityApiClient` を使って検知サーバーへ転送します。Next.js Route Handler の例:

```ts
// app/api/security/aidetector/detect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildUnifiedDetectionRequest, SecurityApiClient, extractNetworkFingerprint } from '@browser-agent-sdk/node-bridge';

const endpoint = process.env.AI_DETECTOR_ENDPOINT_URL!;
const apiKey = process.env.AI_DETECTOR_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const snapshot = await request.json(); // client の BehaviorTracker から届く
    const network = extractNetworkFingerprint({ headers: request.headers });

    const unifiedRequest = buildUnifiedDetectionRequest(snapshot, {
      sessionId: snapshot.sessionId ?? 'session_unknown',
      ipAddress: request.ip ?? request.headers.get('x-forwarded-for') ?? 'ip_unknown',
      requestId: crypto.randomUUID(),
      headers: { 'user-agent': request.headers.get('user-agent') ?? '' },
      siteId: snapshot.context?.siteId ?? request.headers.get('host') ?? 'site_unknown',
      network,
    });

    const client = new SecurityApiClient({ endpoint, apiKey });
    const detectorResponse = await client.detect(unifiedRequest);
    return NextResponse.json(detectorResponse);
  } catch (error) {
    console.error('AI detector proxy error', error);
    return NextResponse.json({ error: 'AI detector processing failed' }, { status: 500 });
  }
}
```

ポイント:
- 検知サーバーの URL/API キーは環境変数で注入 (`AI_DETECTOR_ENDPOINT_URL`, `AI_DETECTOR_API_KEY`)。
- `extractNetworkFingerprint` を併用すると、JA4/HTTP Signature などのネットワーク指紋を自動付与できます。
- エラー時のフェイルオープン（許可寄り）挙動は SDK がハンドリングします。

## 4. ペルソナ／購入異常検知を使う場合（オプション）
購買時にクラスタ異常検知を呼びたい場合は、サーバーから直接 `POST /detect_cluster_anomaly` を叩きます。

```ts
// 例: app/api/purchase/check などから
const res = await fetch(`${process.env.AI_DETECTOR_ENDPOINT_URL}/detect_cluster_anomaly`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.AI_DETECTOR_API_KEY}`,
  },
  body: JSON.stringify({
    age: 35,
    gender: 1,
    prefecture: 13,
    product_category: 1,
    quantity: 1,
    price: 12000,
    total_amount: 12000,
    purchase_time: 14,
    limited_flag: 0,
    payment_method: 3,
    manufacturer: 5,
  }),
});
```

レスポンスの `is_anomaly` が `true` の場合は決済をブロックする等の分岐を入れてください。

## 5. 動作確認フロー
1. `.env` に `AI_DETECTOR_ENDPOINT_URL`, `AI_DETECTOR_API_KEY` を設定し、アプリを起動。
2. サイトを開き、ページ遷移やフォーム入力を行う。
3. ネットワークタブで `/api/security/aidetector/detect` → 検知サーバーへの中継が 200 になることを確認。
4. 必要に応じて、サーバー側で検知結果をログ（例: `logs/security.log`）へ保存し、スコアやリスクレベルを UI に表示。

## 6. 参考ドキュメント
- API 仕様: `docs/API-doc.md`
- 変数一覧・要求事項: `docs/requirements.md`, `docs/data-model.md`
- 全体概要: `README.md`
