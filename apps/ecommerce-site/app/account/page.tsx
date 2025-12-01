'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  email: string;
  age_group?: string;
  age?: number;
  occupation: string;
  member_rank: string;
  registration_date: string;
  total_orders: number;
  total_spent: number;
  last_purchase_date: string | null;
  full_name?: string;
  phone_number?: string;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_prefecture?: string;
  postal_code?: string;
  orders?: {
    id: number;
    total_amount: number;
    created_at: string;
    items: { product_id: number; quantity: number; unit_price: number; name?: string }[];
  }[];
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  // ユーザー情報取得
  useEffect(() => {
    async function fetchUserInfo() {
      try {
        const response = await fetch('/api/auth/me');
        
        if (response.status === 401) {
          // 未認証の場合はログインページへリダイレクト
          router.push('/login');
          return;
        }
        
        if (!response.ok) {
          throw new Error('ユーザー情報の取得に失敗しました');
        }
        
        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        console.error('User info error:', err);
        setError('ユーザー情報の読み込み中にエラーが発生しました');
      } finally {
        setLoading(false);
      }
    }
    
    fetchUserInfo();
  }, [router]);

  // ログアウト処理
  async function handleLogout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('ログアウト処理に失敗しました');
      }
      
      // ログアウト成功
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      alert('ログアウト処理中にエラーが発生しました');
    }
  }
  
  // 会員ランクの表示色
  function getMemberRankColor(rank: string): string {
    switch (rank) {
      case 'bronze': return 'bg-yellow-700';
      case 'silver': return 'bg-gray-300';
      case 'gold': return 'bg-yellow-400';
      case 'platinum': return 'bg-blue-300';
      default: return 'bg-gray-200';
    }
  }
  
  // 職業の日本語表示
  function getOccupationText(occupation: string): string {
    switch (occupation) {
      case 'student': return '学生';
      case 'office': return '会社員（一般）';
      case 'tech': return 'IT・技術職';
      case 'service': return 'サービス業';
      case 'other': return 'その他';
      default: return occupation;
    }
  }
  
  if (loading) {
    return <div className="text-center py-8">ユーザー情報を読み込み中...</div>;
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded">
        <p>ユーザー情報が取得できませんでした</p>
        <button
          onClick={() => router.push('/login')}
          className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
        >
          ログインページへ
        </button>
      </div>
    );
  }
  
  // 登録日のフォーマット
  const registrationDate = new Date(user.registration_date).toLocaleDateString('ja-JP');
  
  const addressLines = [
    user.postal_code ? `〒${user.postal_code}` : null,
    user.address_prefecture,
    user.address_city,
    user.address_line1,
    user.address_line2,
  ].filter(Boolean).join(' ');

  // 最終購入日のフォーマット
  const lastPurchaseDate = user.last_purchase_date
    ? new Date(user.last_purchase_date).toLocaleDateString('ja-JP')
    : 'なし';

  const hasOrders = user.orders && user.orders.length > 0;
  
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">アカウント情報</h1>
      
      <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 bg-indigo-50 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-indigo-800">{user.email}</h2>
            <span className={`${getMemberRankColor(user.member_rank)} text-white px-2 py-1 rounded-full text-xs font-bold uppercase`}>
              {user.member_rank}
            </span>
          </div>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-500">プロフィール</h3>
                <div className="rounded-md border border-gray-100 p-4 bg-gray-50">
                  <dl className="space-y-3 text-sm text-gray-800">
                    <div>
                      <dt className="text-xs text-gray-500">氏名</dt>
                      <dd>{user.full_name || '未設定'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">電話番号</dt>
                      <dd>{user.phone_number || '未設定'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">住所</dt>
                      <dd className="leading-relaxed whitespace-pre-line">
                        {addressLines || '未設定'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs text-gray-500">職業</dt>
                        <dd>{getOccupationText(user.occupation)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">年齢</dt>
                        <dd>{user.age !== undefined ? `${user.age} 歳` : '未設定'}</dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">登録日</dt>
                      <dd>{registrationDate}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-500">購入サマリ</h3>
                <div className="rounded-md border border-gray-100 p-4 bg-gray-50">
                  <dl className="space-y-3 text-sm text-gray-800">
                    <div>
                      <dt className="text-xs text-gray-500">総注文数</dt>
                      <dd>{user.total_orders}件</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">総購入金額</dt>
                      <dd>¥{user.total_spent.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">最終購入日</dt>
                      <dd>{lastPurchaseDate}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500">注文履歴</h3>
              <div className="rounded-md border border-gray-100 p-4 bg-white shadow-sm">
                {!hasOrders && (
                  <p className="text-sm text-gray-500">注文履歴がありません</p>
                )}
                {hasOrders && (
                  <div className="space-y-4">
                    {user.orders!.map((order) => (
                      <div key={order.id} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                        <div className="flex flex-wrap justify-between text-sm text-gray-700 mb-2">
                          <div className="font-semibold">注文ID: {order.id}</div>
                          <div>{new Date(order.created_at).toLocaleString('ja-JP')}</div>
                        </div>
                        <div className="text-sm text-gray-800 mb-2">合計: ¥{order.total_amount.toLocaleString()}</div>
                        <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                          {order.items.map((item, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>
                                {item.name || `商品ID ${item.product_id}`} × {item.quantity}
                              </span>
                              <span>¥{(item.unit_price * item.quantity).toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={() => router.push('/orders')}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          注文履歴を見る
        </button>
        
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
