export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getOrderDetails } from '@/app/lib/orders';
import { getSession } from '@/app/lib/session';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

// 注文詳細を取得するAPI
export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderId = parseInt(params.orderId);
    
    if (isNaN(orderId)) {
      return NextResponse.json(
        { error: '無効な注文IDです' },
        { status: 400 }
      );
    }
    
    // セッションから認証情報を取得
    const session = await getSession();
    
    if (!session || !session.data.userId) {
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }
    
    // 注文詳細を取得
    const orderDetails = await getOrderDetails(orderId, session.data.userId);
    
    if (!orderDetails) {
      return NextResponse.json(
        { error: '注文が見つかりません' },
        { status: 404 }
      );
    }
    
    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: `/api/orders/${orderId}`,
      requestMethod: 'GET',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });
    
    return NextResponse.json(orderDetails);
  } catch (error) {
    console.error('Order details error:', error);
    
    return NextResponse.json(
      { error: '注文詳細の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
