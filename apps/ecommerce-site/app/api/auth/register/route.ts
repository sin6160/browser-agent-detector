export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/app/lib/auth';
import { logSecurityEvent } from '@/app/lib/logger';
import { SECURITY_SUITE_LABEL } from '@/app/lib/security';

export async function POST(request: NextRequest) {
  try {
    const { email, password, age_group, occupation, recaptchaToken } = await request.json();

    // 入力検証
    if (!email || !password || !age_group || !occupation) {
      return NextResponse.json(
        { error: 'すべての項目は必須です' },
        { status: 400 }
      );
    }

    // 年齢層とオキュペーションの検証
    const validAgeGroups = ['20s', '30s', '40s', '50s+'];
    const validOccupations = ['student', 'office', 'tech', 'service', 'other'];

    if (!validAgeGroups.includes(age_group)) {
      return NextResponse.json(
        { error: '無効な年齢層です' },
        { status: 400 }
      );
    }

    if (!validOccupations.includes(occupation)) {
      return NextResponse.json(
        { error: '無効な職業です' },
        { status: 400 }
      );
    }

    // reCAPTCHAトークンは常時検証（結果はログ用途）
    if (recaptchaToken) {
      try {
        console.log('バックエンド: 登録時のreCAPTCHAトークン取得成功');

        // 非同期でトークン検証を実行（結果はログ用）
        fetch(`${request.nextUrl.origin}/api/security/recaptcha/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: recaptchaToken })
        }).then(async (res) => {
          try {
            if (res.ok) {
              const data = await res.json();
              console.log('reCAPTCHA登録時スコア（記録のみ）:', data.score);

              // スコアが低い場合はログに記録するのみ
              if (data.score && data.score < 0.5) {
                logSecurityEvent({
                  sessionId: request.cookies.get('ec_session')?.value || 'unknown',
                  ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
                  userAgent: request.headers.get('user-agent') || 'unknown',
                  requestPath: '/api/auth/register',
                  requestMethod: 'POST',
                  securityMode: SECURITY_SUITE_LABEL,
                  actionTaken: 'log_only', // ログのみ
                  detectionReasons: { reason: 'recaptcha_score_low', score: data.score }
                });
              }
            }
          } catch (err) {
            console.log('登録時スコア取得エラー（無視）:', err);
          }
        }).catch(err => {
          console.log('reCAPTCHA API呼び出しエラー（無視）:', err);
        });

      } catch (error) {
        console.log('reCAPTCHA処理エラー（無視）:', error);
      }
    }

    // ユーザー登録
    const user = await registerUser(email, password, age_group, occupation);

    if (!user) {
      // 登録失敗
      // セキュリティイベントをログに記録
      logSecurityEvent({
        sessionId: request.cookies.get('ec_session')?.value || 'unknown',
        ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestPath: '/api/auth/register',
        requestMethod: 'POST',
        securityMode: SECURITY_SUITE_LABEL,
        actionTaken: 'reject',
        detectionReasons: { reason: 'registration_failed' }
      });

      return NextResponse.json(
        { error: 'メールアドレスが既に使用されているか、登録処理に失敗しました' },
        { status: 400 }
      );
    }

    // 登録成功
    // セキュリティイベントをログに記録
    logSecurityEvent({
      sessionId: request.cookies.get('ec_session')?.value || 'unknown',
      userId: user.id,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestPath: '/api/auth/register',
      requestMethod: 'POST',
      securityMode: SECURITY_SUITE_LABEL,
      actionTaken: 'allow',
      detectionReasons: {}
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        age_group: user.age_group,
        occupation: user.occupation,
        member_rank: user.member_rank
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    return NextResponse.json(
      { error: 'アカウント登録中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
