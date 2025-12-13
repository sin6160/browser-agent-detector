export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getLimitedProducts } from '@/app/lib/products';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

export async function GET(request: NextRequest) {
  try {
    // 限定商品一覧を取得
    const products = await getLimitedProducts();
    
    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: request.cookies.get('ec_session')?.value || 'unknown',
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/products/limited',
      requestMethod: 'GET',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });
    
    return NextResponse.json({ products });
  } catch (error) {
    console.error('Limited products API error:', error);
    
    return NextResponse.json(
      { error: '限定商品情報の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
