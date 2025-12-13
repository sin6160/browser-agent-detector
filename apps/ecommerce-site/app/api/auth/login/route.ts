export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/app/lib/auth';
import { createSession } from '@/app/lib/session';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

export async function POST(request: NextRequest) {
  try {
    const { email, password, recaptchaToken } = await request.json();

    // 入力検証
    if (!email || !password) {
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です' },
        { status: 400 }
      );
    }

    // reCAPTCHAトークンを常にバックグラウンド送信（結果はログ用途）
    if (recaptchaToken) {
      try {
        fetch(`${request.nextUrl.origin}/api/security/recaptcha/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: recaptchaToken,
            action: 'LOGIN'
          })
        }).catch(() => {
          // 背景検証のエラーは認証結果に影響させない
        });
      } catch {
        // 非同期検証の失敗は無視
      }
    }

    // ユーザー認証
    const user = await authenticateUser(email, password);

    if (!user) {
      // ログイン失敗
      // セキュリティイベントをログに記録
      logSecurityEvent({
        sessionId: request.cookies.get('ec_session')?.value || 'unknown',
        ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestPath: '/api/auth/login',
        requestMethod: 'POST',
        securityMode: SECURITY_SUITE_LABEL,
        actionTaken: 'reject',
        detectionReasons: { reason: 'invalid_credentials' }
      });

      return NextResponse.json(
        { error: 'メールアドレスまたはパスワードが正しくありません' },
        { status: 401 }
      );
    }

    // ログイン成功 - セッション作成
    const sessionId = await createSession({
      userId: user.id,
      email: user.email,
      memberRank: user.member_rank
    });

    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId,
      userId: user.id,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/auth/login',
      requestMethod: 'POST',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    // レスポンスを作成
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        age_group: user.age_group,
        occupation: user.occupation,
        member_rank: user.member_rank
      }
    });

    // セッションCookieを設定
    response.cookies.set({
      name: 'ec_session',
      value: sessionId,
      httpOnly: false, // クライアントサイドでも取得可能にする
      path: '/',
      sameSite: 'lax',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);

    return NextResponse.json(
      { error: 'ログイン処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
