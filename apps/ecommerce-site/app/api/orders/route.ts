export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getUserOrders, createOrderFromCart } from '@/app/lib/orders';
import { getSession } from '@/app/lib/session';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

// 注文履歴を取得するGETリクエスト
export async function GET(request: NextRequest) {
  try {
    // セッションから認証情報を取得
    const session = await getSession();

    if (!session || !session.data.userId) {
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    // ユーザーの注文履歴を取得
    const orders = await getUserOrders(session.data.userId);

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/orders',
      requestMethod: 'GET',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Orders history error:', error);

    return NextResponse.json(
      { error: '注文履歴の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 注文作成POSTリクエスト（購入手続きAPIにリダイレクト）
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/orders - 購入手続きAPIにリダイレクト');

    // 購入手続きAPIを呼び出し
    const purchaseResponse = await fetch(`${request.nextUrl.origin}/api/purchase/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
        'User-Agent': request.headers.get('user-agent') || '',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify({})
    });

    // レスポンスをそのまま返す
    const responseData = await purchaseResponse.json();

    const response = NextResponse.json(responseData, {
      status: purchaseResponse.status
    });

    // セッションクッキーを転送
    const setCookieHeader = purchaseResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      response.headers.set('set-cookie', setCookieHeader);
    }

    return response;
  } catch (error) {
    console.error('Order creation error:', error);

    return NextResponse.json(
      { error: '注文処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
