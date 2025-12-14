'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../lib/auth-provider';

interface Product {
  id: number;
  name: string;
  category: number;
  brand: number;
  price: number;
  stock_quantity: number;
  is_limited: boolean;
  image_path: string | null;
  description: string | null;
  pc1?: number | null;
  pc2?: number | null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, userId, checkSession } = useAuth();

  const showLimited = searchParams.get('limited') === 'true';
  const category = searchParams.get('category');

  // ポップアップ表示関数
  const showNotification = (message: string) => {
    setPopupMessage(message);
    setShowPopup(true);

    // 3秒後に自動的に薄くなって消える
    setTimeout(() => {
      setShowPopup(false);
    }, 3000);
  };

  useEffect(() => {
    async function fetchProducts() {
      try {
        // URLパラメータに基づいてAPIエンドポイントを選択
        let url = '/api/products';

        if (showLimited) {
          url += '/limited';
        } else if (category) {
          url += `/category/${encodeURIComponent(category)}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('商品情報の取得に失敗しました');
        }

        const data = await response.json();
        setProducts(data.products || []);
      } catch (err) {
        console.error('Products fetch error:', err);
        setError('商品情報の読み込み中にエラーが発生しました');
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [showLimited, category]);

  // 数量変更ハンドラー
  const handleQuantityChange = (productId: number, quantity: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, Math.min(quantity, 99)) // 1-99の範囲に制限
    }));
  };

  async function handleAddToCart(productId: number, quantity: number = 1) {
    try {
      // 認証状態を確認
      if (!isLoggedIn || !userId) {
        // セッションがない場合はログインページへリダイレクト
        alert('ログインが必要です');
        router.push('/login');
        return;
      }

      // デバッグ用にセッション情報をコンソールに出力
      console.log('カートに商品を追加します', { isLoggedIn, userId, productId, quantity });
      console.log('Cookie:', document.cookie);

      // セッション検証を統合されたcheckSessionに委譲
      const sessionValid = await checkSession();
      if (!sessionValid) {
        alert('セッションが無効です。再度ログインしてください。');
        router.push('/login');
        return;
      }

      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
        credentials: 'include' // Cookieを含める
      });

      const data = await response.json();

      if (response.ok) {
        // 成功メッセージ表示やカート更新のロジック
        showNotification('商品がカートに追加されました');

        // ヘッダーのカート数を更新
        if ((window as any).updateCartCount) {
          (window as any).updateCartCount();
        }
      } else {
        // エラー表示
        alert(data.error || 'カートへの追加に失敗しました');

        // 認証エラーの場合はログインページへリダイレクト
        if (response.status === 401) {
          alert('セッションが無効です。再度ログインしてください。');
          router.push('/login');
        }
      }
    } catch (err) {
      console.error('Add to cart error:', err);
      alert('カートへの追加処理中にエラーが発生しました');
    }
  }

  if (loading) {
    return <div className="text-center py-8">商品情報を読み込み中...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  // カテゴリーフィルタリングのUI
  const categories = [
    {id: '1', name: 'PC・スマートフォン'},
    {id: '2', name: '家電'},
    {id: '3', name: '本・雑誌'},
    {id: '4', name: 'お菓子・食品'},
    {id: '5', name: 'スポーツ用品'},
    {id: '6', name: 'ペット用品'},
    {id: '7', name: 'ファッション'},
    {id: '8', name: '美容・健康'},
    {id: '9', name: 'インテリア・家具'},
    {id: '10', name: 'ゲーム・エンタメ'},
    {id: '11', name: 'ギフト券'},
    {id: '12', name: 'その他'}
  ];
  const categoryNameMap = categories.reduce<Record<string, string>>((acc, curr) => {
    acc[curr.id] = curr.name;
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        {showLimited ? '限定商品コレクション' : category ? `${categoryNameMap[category] || category}` : 'おすすめ商品一覧'}
      </h1>

      {/* フィルタリングUI */}
      <div className="mb-6 pb-4 border-b">
        <div className="flex flex-wrap gap-2 mb-2">
          <Link href="/products" className={`px-3 py-1 rounded-full text-sm ${!category && !showLimited ? 'bg-pink-600 text-white' : 'bg-gray-100 hover:bg-gray-200 transition-colors'}`}>
            すべての商品
          </Link>
          <Link href="/products?limited=true" className={`px-3 py-1 rounded-full text-sm ${showLimited ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200 transition-colors'}`}>
            限定商品
          </Link>
        </div>

        <div className="mt-4 md:flex md:items-end md:justify-between">
          <div>
            <h2 className="text-xs font-semibold text-gray-600 mb-2">カテゴリーで絞り込む</h2>

            {/* ドロップダウンメニュー */}
            <div className="relative inline-block w-full md:w-64">
              <select
                className="block appearance-none w-full bg-white border border-gray-300 hover:border-pink-500 px-4 py-2 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                value={category || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    router.push(`/products?category=${value}`);
                  } else {
                    router.push('/products');
                  }
                }}
              >
                <option value="">すべてのカテゴリー</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>
          </div>

          {/* 現在選択中のカテゴリ表示（モバイル向け） */}
          {category && (
            <div className="mt-3 md:mt-0 text-sm">
              <span className="text-gray-500">選択中: </span>
              <span className="font-medium">{categories.find(cat => cat.id === category)?.name}</span>
              <button
                onClick={() => router.push('/products')}
                className="ml-2 text-pink-600 hover:text-pink-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="sr-only">クリア</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded">
          <p>該当する商品がありません</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map(product => {
            return (
              <div key={product.id} className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow duration-200">
                <div style={{height: '200px', width: '200px'}} className="mx-auto bg-gray-50 flex items-center justify-center overflow-hidden">
                  {product.image_path ? (
                    <img
                      src={product.image_path}
                      alt={product.name}
                      style={{maxHeight: '180px', maxWidth: '180px'}}
                      className="object-contain"
                    />
                  ) : (
                    <div className="text-gray-400">画像なし</div>
                  )}
                </div>

                <div className="p-3">
                  <div className="flex justify-between items-start mb-1">
                    <h2 className="text-base font-semibold text-gray-900 line-clamp-2 h-10">{product.name}</h2>
                    {product.is_limited && (
                      <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ml-1">限定</span>
                    )}
                  </div>

                  <div className="flex justify-between items-center mb-1">
                    <p className="text-gray-500 text-xs">商品ID: {product.id}</p>
                    <p className="text-gray-500 text-xs">
                      {categoryNameMap[String(product.category)] || 'その他'}
                    </p>
                  </div>
                  <p className="text-gray-800 font-bold text-base mb-1">¥{product.price.toLocaleString()}</p>
                  {product.description && (
                    <p className="text-xs text-gray-700 mb-2 line-clamp-3 h-12">{product.description}</p>
                  )}

                  <div className="space-y-2 mt-3">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs ${product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {product.stock_quantity > 0 ? `残り${product.stock_quantity}点` : '在庫切れ'}
                    </span>
                    </div>

                    {/* 数量選択 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        <label className="text-xs text-gray-600">数量:</label>
                        <select
                          value={quantities[product.id] || 1}
                          onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value))}
                          disabled={product.stock_quantity === 0}
                          className="text-xs text-gray-900 border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-pink-500 bg-white"
                        >
                          {Array.from({ length: Math.min(10, product.stock_quantity) }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => handleAddToCart(product.id, quantities[product.id] || 1)}
                        disabled={product.stock_quantity === 0}
                        className={`px-2 py-1 rounded text-xs ${
                          product.stock_quantity > 0
                            ? 'bg-pink-500 hover:bg-pink-600 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        カートに追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 購入手続きボタン */}
      {isLoggedIn && (
        <div className="mt-24 text-center">
          <Link
            href="/cart"
            className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors duration-300 shadow-lg"
          >
            購入手続きに進む
          </Link>
        </div>
      )}

      {/* 通知ポップアップ */}
      {showPopup && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-out">
          <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{popupMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
