export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getUserCart, addToCart, updateCartItemQuantity, updateCartItemRecipientEmail, removeFromCart, clearCart } from '@/app/lib/cart';
import { getSession } from '@/app/lib/session';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

// カート情報取得
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

    // ユーザーのカートを取得
    const cartItems = await getUserCart(session.data.userId);

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/cart',
      requestMethod: 'GET',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    return NextResponse.json({ cartItems });
  } catch (error) {
    console.error('Cart get error:', error);

    return NextResponse.json(
      { error: 'カート情報の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// カートに商品を追加
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/cart - リクエスト受信', {
      cookies: request.cookies.getAll(),
      headers: Object.fromEntries(request.headers.entries())
    });

    // セッションから認証情報を取得
    const session = await getSession();

    if (!session || !session.data.userId) {
      console.log('セッションが存在しないか、userIdが無い', session);
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    console.log('セッション発見:', {
      sessionId: session.sessionId,
      userId: session.data.userId
    });

    const { productId, quantity } = await request.json();

    // 入力検証
    if (!productId || !quantity || quantity <= 0) {
      return NextResponse.json(
        { error: '無効な商品IDまたは数量です' },
        { status: 400 }
      );
    }

    // カートに商品を追加
    const success = await addToCart(session.data.userId, productId, quantity);

    if (!success) {
      return NextResponse.json(
        { error: '在庫不足または無効な商品です' },
        { status: 400 }
      );
    }

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/cart',
      requestMethod: 'POST',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    // 更新後のカートを取得して返す
    const cartItems = await getUserCart(session.data.userId);

    const response = NextResponse.json({ success: true, cartItems });

    // 応答ごとにセッションクッキーを再設定して確実に保持されるようにする
    response.cookies.set({
      name: 'ec_session',
      value: session.sessionId,
      httpOnly: false,
      path: '/',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 // 24時間
    });

    return response;
  } catch (error) {
    console.error('Cart add error:', error);

    return NextResponse.json(
      { error: 'カートへの追加中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// カート内商品の数量を更新または削除
export async function PATCH(request: NextRequest) {
  try {
    // セッションから認証情報を取得
    const session = await getSession();

    if (!session || !session.data.userId) {
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const { cartItemId, quantity, recipientEmail } = await request.json();

    // 入力検証
    if (!cartItemId) {
      return NextResponse.json(
        { error: '無効なカートアイテムIDです' },
        { status: 400 }
      );
    }

    // カート内商品を更新または削除
    let success = false;

    if (quantity !== undefined && quantity <= 0) {
      // 数量が0以下なら削除
      success = await removeFromCart(session.data.userId, cartItemId);
    } else if (quantity !== undefined) {
      // 数量を更新
      success = await updateCartItemQuantity(session.data.userId, cartItemId, quantity);
    }

    // 受取人メールアドレスが指定されている場合は更新
    if (recipientEmail !== undefined && success) {
      success = await updateCartItemRecipientEmail(session.data.userId, cartItemId, recipientEmail);
    }

    if (!success) {
      return NextResponse.json(
        { error: 'カートの更新に失敗しました' },
        { status: 400 }
      );
    }

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/cart',
      requestMethod: 'PATCH',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    // 更新後のカートを取得して返す
    const cartItems = await getUserCart(session.data.userId);

    return NextResponse.json({ success: true, cartItems });
  } catch (error) {
    console.error('Cart update error:', error);

    return NextResponse.json(
      { error: 'カートの更新中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// カートをクリア
export async function DELETE(request: NextRequest) {
  try {
    // セッションから認証情報を取得
    const session = await getSession();

    if (!session || !session.data.userId) {
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    // カートをクリア
    const success = await clearCart(session.data.userId);

    if (!success) {
      return NextResponse.json(
        { error: 'カートのクリアに失敗しました' },
        { status: 500 }
      );
    }

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/cart',
      requestMethod: 'DELETE',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cart clear error:', error);

    return NextResponse.json(
      { error: 'カートのクリア中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
