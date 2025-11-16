import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/app/lib/session';
import { getUserById } from '@/app/lib/auth';
import { getUserCart } from '@/app/lib/cart';
import { createOrderFromCart } from '@/app/lib/orders';
import { detectPurchaseAnomaly, shouldAllowPurchase } from '@/app/lib/purchase-detection';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

/**
 * 購入手続きAPI
 * 検知サーバーを呼び出して異常検知を実行し、結果に基づいて購入処理を継続または停止
 */
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/purchase/check - リクエスト受信');

    // セッションから認証情報を取得
    const session = await getSession();

    if (!session || !session.data.userId) {
      console.log('セッションが存在しないか、userIdが無い', session);
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    console.log('購入手続き処理: セッション発見', {
      sessionId: session.sessionId,
      userId: session.data.userId
    });

    // ユーザー情報を取得
    const user = await getUserById(session.data.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'ユーザー情報が見つかりません' },
        { status: 404 }
      );
    }

    // カート情報を取得
    const cartItems = await getUserCart(session.data.userId);
    console.log('カート情報確認:', { userId: session.data.userId, cartItemCount: cartItems.length, cartItems });

    if (cartItems.length === 0) {
      console.log('カートが空のため400エラーを返します');
      return NextResponse.json(
        { error: 'カートが空です' },
        { status: 400 }
      );
    }

    console.log('購入手続き処理: データ取得完了', {
      userId: user.id,
      cartItemCount: cartItems.length
    });

    // 検知サーバーを呼び出して異常検知を実行
    let detectionResult;

    try {
      detectionResult = await detectPurchaseAnomaly(user, cartItems);
      console.log('異常検知完了:', detectionResult);
    } catch (error) {
      console.error('異常検知エラー:', error);

      // 異常検知の場合は購入を停止
      if (error instanceof Error && error.message.includes('ANOMALY_DETECTED')) {
        // セキュリティイベントをログに記録
        logSecurityEvent({
          sessionId: session.sessionId,
          userId: session.data.userId,
          ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          requestPath: '/api/purchase/check',
          requestMethod: 'POST',
          securityMode: SECURITY_SUITE_LABEL,
          actionTaken: 'block',
          detectionReasons: {
            cluster_anomaly: true,
            error_message: error.message
          }
        });

        return NextResponse.json(
          {
            status: 'error',
            error_code: 'ANOMALY_DETECTED',
            message: 'AIエージェントによる不正操作を検知：ユーザーのペルソナから逸脱した異常な行動を検知しました。',
            clusteringScore: detectionResult?.anomaly_score || null,
            clusteringThreshold: detectionResult?.threshold || null
          },
          { status: 403 }
        );
      }

      logSecurityEvent({
        sessionId: session.sessionId,
        userId: session.data.userId,
        ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestPath: '/api/purchase/check',
        requestMethod: 'POST',
        securityMode: SECURITY_SUITE_LABEL,
        actionTaken: 'error',
        detectionReasons: {
          detector_unavailable: true,
          message: error instanceof Error ? error.message : 'unknown_error',
        },
      });

      return NextResponse.json(
        { error: 'AIエージェント検知サーバーが利用できません。しばらくしてから再試行してください。' },
        { status: 503 },
      );
    }

    // 検知結果に基づいて購入を許可するかどうかを判定
    if (detectionResult && !shouldAllowPurchase(detectionResult)) {
      // 異常検知の場合は購入を停止
      logSecurityEvent({
        sessionId: session.sessionId,
        userId: session.data.userId,
        ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestPath: '/api/purchase/check',
        requestMethod: 'POST',
        securityMode: SECURITY_SUITE_LABEL,
        actionTaken: 'block',
        detectionReasons: {
          cluster_anomaly: true,
          anomaly_score: detectionResult.anomaly_score,
          threshold: detectionResult.threshold
        }
      });

        return NextResponse.json(
          {
            status: 'error',
            error_code: 'ANOMALY_DETECTED',
            message: 'AIエージェントによる不正操作を検知：ユーザーのペルソナから逸脱した異常な行動を検知しました。',
            clusteringScore: detectionResult?.anomaly_score || null,
            clusteringThreshold: detectionResult?.threshold || null
          },
          { status: 403 }
        );
    }

    // 購入処理を継続
    console.log('購入処理を継続します');

    // カートから注文を作成
    const orderId = await createOrderFromCart(session.data.userId, {
      botScore: detectionResult?.anomaly_score || null,
      securityAction: detectionResult?.is_anomaly ? 'blocked' : 'allowed'
    });

    if (!orderId) {
      console.log('注文作成に失敗しました。orderId:', orderId);
      return NextResponse.json(
        { error: '注文の作成に失敗しました。カートが空であるか、在庫が不足している可能性があります。' },
        { status: 400 }
      );
    }

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: session.sessionId,
      userId: session.data.userId,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/purchase/check',
      requestMethod: 'POST',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {
        cluster_anomaly: false,
        anomaly_score: detectionResult?.anomaly_score || null,
        threshold: detectionResult?.threshold || null,
      }
    });

    // 成功レスポンスを作成
    const response = NextResponse.json({
      status: 'success',
      message: '購入手続きが完了しました',
      orderId,
      detectionResult: detectionResult ? {
        cluster_id: detectionResult.cluster_id,
        anomaly_score: detectionResult.anomaly_score,
        threshold: detectionResult.threshold,
        is_anomaly: detectionResult.is_anomaly
      } : null,
      clusteringScore: detectionResult?.anomaly_score || null,
      clusteringThreshold: detectionResult?.threshold || null
    });

    // セッションクッキーを再設定して確実に保持されるようにする
    response.cookies.set({
      name: 'ec_session',
      value: session.sessionId,
      httpOnly: false,
      path: '/',
      sameSite: 'lax'
    });

    return response;

  } catch (error) {
    console.error('購入手続きエラー:', error);

    return NextResponse.json(
      { error: '購入手続き中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
