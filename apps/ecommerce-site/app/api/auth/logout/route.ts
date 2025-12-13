export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/app/lib/session';

export async function POST(request: NextRequest) {
  try {
    // セッションを破棄
    const success = await destroySession();
    
    if (!success) {
      return NextResponse.json(
        { error: 'ログアウト処理に失敗しました' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    
    return NextResponse.json(
      { error: 'ログアウト処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
