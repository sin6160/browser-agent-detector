export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/app/lib/auth';
import { getUserOrdersWithItems } from '@/app/lib/orders';
import { getSession } from '@/app/lib/session';

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
    
    // ユーザー情報を取得
    const user = await getUserById(session.data.userId);
    const orders = await getUserOrdersWithItems(session.data.userId);
    
    if (!user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ user: { ...user, orders } });
  } catch (error) {
    console.error('User info error:', error);
    
    return NextResponse.json(
      { error: 'ユーザー情報取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
