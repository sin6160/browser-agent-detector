export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getProductsByCategory } from '@/app/lib/products';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

// カテゴリーごとの商品を取得するAPI
export async function GET(
  request: NextRequest,
  { params }: { params: { category: string } }
) {
  try {
    const { category } = params;
    
    if (!category) {
      return NextResponse.json(
        { error: 'カテゴリーが指定されていません' },
        { status: 400 }
      );
    }
    
    // カテゴリー別商品一覧を取得
    const products = await getProductsByCategory(category);
    
    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: request.cookies.get('ec_session')?.value || 'unknown',
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: `/api/products/category/${category}`,
      requestMethod: 'GET',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });
    
    return NextResponse.json({ products });
  } catch (error) {
    console.error('Category products API error:', error);
    
    return NextResponse.json(
      { error: 'カテゴリー別商品情報の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
