export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getAllProducts, addProduct } from '@/app/lib/products';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

export async function GET(request: NextRequest) {
  try {
    // 全商品一覧を取得
    const products = await getAllProducts();

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: request.cookies.get('ec_session')?.value || 'unknown',
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/products',
      requestMethod: 'GET',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Products API error:', error);

    return NextResponse.json(
      { error: '商品情報の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const productData = await request.json();

    // 入力検証
    if (!productData.name || productData.category === undefined || productData.brand === undefined ||
        !productData.price || productData.stock_quantity === undefined) {
      return NextResponse.json(
        { error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    // 価格と在庫数の検証
    if (productData.price <= 0 || productData.stock_quantity < 0) {
      return NextResponse.json(
        { error: '価格は0より大きく、在庫数は0以上である必要があります' },
        { status: 400 }
      );
    }

    // カテゴリとブランドの数値範囲検証
    if (productData.category < 1 || productData.category > 12) {
      return NextResponse.json(
        { error: 'カテゴリは1-12の範囲で指定してください' },
        { status: 400 }
      );
    }

    if (productData.brand < 1 || productData.brand > 20) {
      return NextResponse.json(
        { error: 'ブランドは1-20の範囲で指定してください' },
        { status: 400 }
      );
    }

    // 商品を追加
    const productId = await addProduct({
      name: productData.name,
      category: productData.category,
      brand: productData.brand,
      price: productData.price,
      stock_quantity: productData.stock_quantity,
      is_limited: productData.is_limited || false,
      image_path: productData.image_path || null,
      description: productData.description || null
    });

    if (!productId) {
      return NextResponse.json(
        { error: '商品の追加に失敗しました' },
        { status: 500 }
      );
    }

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: request.cookies.get('ec_session')?.value || 'unknown',
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/products',
      requestMethod: 'POST',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    return NextResponse.json({
      success: true,
      productId,
      message: '商品が正常に追加されました'
    });
  } catch (error) {
    console.error('Product creation API error:', error);

    return NextResponse.json(
      { error: '商品の追加中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
