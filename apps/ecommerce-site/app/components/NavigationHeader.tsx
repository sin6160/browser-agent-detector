'use client';

import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAIDetector } from '@/app/components/AIDetectorProvider';
import { useAuth } from '../lib/auth-provider';

const OTM_REDIRECT_THRESHOLD = 0.5;

export default function NavigationHeader() {
  const { isLoggedIn, email, logout, userId } = useAuth();
  const [cartCount, setCartCount] = useState(0);
  const [accountNavLoading, setAccountNavLoading] = useState(false);
  const router = useRouter();
  const { checkDetection } = useAIDetector();

  // カート数を取得する関数
  const fetchCartCount = async () => {
    if (!isLoggedIn || !userId) {
      setCartCount(0);
      return;
    }

    try {
      const response = await fetch('/api/cart');
      if (response.ok) {
        const data = await response.json();
        const totalItems = data.cartItems?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
        setCartCount(totalItems);
      }
    } catch (error) {
      console.error('カート数取得エラー:', error);
      setCartCount(0);
    }
  };

  // カート数を更新する関数（グローバルに公開）
  const updateCartCount = () => {
    fetchCartCount();
  };

  // グローバル関数として公開
  useEffect(() => {
    (window as any).updateCartCount = updateCartCount;
  }, [isLoggedIn, userId]);

  // 初期化時とログイン状態変更時にカート数を取得
  useEffect(() => {
    fetchCartCount();
  }, [isLoggedIn, userId]);

  const extractAiScore = useCallback((payload: any): number | null => {
    if (!payload) return null;
    if (typeof payload.botScore === 'number') return payload.botScore;
    if (typeof payload.bot_score === 'number') return payload.bot_score;
    if (typeof payload.score === 'number') return payload.score;
    const browserScore = payload?.browser_detection?.score;
    return typeof browserScore === 'number' ? browserScore : null;
  }, []);

  const handleAccountNavigate = useCallback(
    async (event?: MouseEvent<HTMLAnchorElement>) => {
      event?.preventDefault();
      if (accountNavLoading) return;
      setAccountNavLoading(true);

      let score: number | null = null;
      try {
        const result = await checkDetection('ACCOUNT_NAV');
        score = extractAiScore(result);
      } catch (error) {
        console.error('Account navigation detection error:', error);
      }

      // スコアが取れなかった場合はバッジ（localStorage）を信頼し、数値でなければリダイレクトしない
      if (!Number.isFinite(score) && typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('aiDetectorScore');
        const parsed = stored ? Number.parseFloat(stored) : NaN;
        score = Number.isFinite(parsed) ? parsed : null;
      }

      const redirectToOtm =
        Number.isFinite(score) && (score as number) <= OTM_REDIRECT_THRESHOLD;
      const target = redirectToOtm ? '/account/otm' : '/account';

      try {
        if (typeof window !== 'undefined') {
          if (redirectToOtm && Number.isFinite(score)) {
            sessionStorage.setItem(
              'accountNavAiScore',
              JSON.stringify({ score: Number(score), ts: Date.now() })
            );
          } else {
            sessionStorage.removeItem('accountNavAiScore');
          }
        }
      } catch (error) {
        console.error('Failed to persist account nav score:', error);
      }

      router.push(target);
      setAccountNavLoading(false);
    },
    [accountNavLoading, checkDetection, extractAiScore, router],
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-pink-700 via-pink-600 to-pink-500 text-white shadow-lg border-b border-pink-500">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <Link href="/" className="group flex items-center space-x-3 transition-all">
            <div className="bg-white/10 backdrop-blur-sm p-2 rounded-xl shadow-lg border border-white/20 group-hover:bg-white/20 transition-all">
              <span className="font-bold">EC</span>
            </div>
            <h1 className="text-2xl font-bold font-heading tracking-tight group-hover:text-pink-200 transition-colors">会員制EC<span className="text-pink-300">サイト</span></h1>
          </Link>

          <nav className="hidden md:block">
            <ul className="flex space-x-8">
              <li>
                <Link href="/" className="relative px-3 py-2 font-medium text-white transition-colors hover:text-pink-200 group">
                  ホーム
                  <span className="absolute left-0 bottom-0 h-0.5 w-0 bg-pink-300 group-hover:w-full transition-all duration-300"></span>
                </Link>
              </li>
              <li>
                <Link href="/products" className="relative px-3 py-2 font-medium text-white transition-colors hover:text-pink-200 group">
                  商品一覧
                  <span className="absolute left-0 bottom-0 h-0.5 w-0 bg-pink-300 group-hover:w-full transition-all duration-300"></span>
                </Link>
              </li>
              <li>
                <Link href="/products?limited=true" className="relative px-3 py-2 font-medium text-white transition-colors hover:text-pink-200 group">
                  限定商品
                  <span className="absolute left-0 bottom-0 h-0.5 w-0 bg-pink-300 group-hover:w-full transition-all duration-300"></span>
                </Link>
              </li>
            </ul>
          </nav>

          <div className="flex items-center space-x-5">
            {isLoggedIn ? (
              <Link href="/cart" className="relative px-3 py-2 text-white hover:text-pink-200 transition-colors group font-medium">
                カート
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border border-pink-700 group-hover:bg-red-600 transition-colors">
                    {cartCount}
                  </span>
                )}
              </Link>
            ) : (
              <Link href="/login" className="relative px-3 py-2 text-white hover:text-pink-200 transition-colors group font-medium">
                カート
              </Link>
            )}

            {isLoggedIn ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-pink-200">こんにちは、{email}</span>
                <Link
                  href="/account"
                  onClick={handleAccountNavigate}
                  className="bg-pink-500/30 backdrop-blur-sm text-white hover:bg-pink-500/50 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg border border-pink-400/30">
                  {accountNavLoading ? 'チェック中...' : 'アカウント'}
                </Link>
                <button
                  onClick={logout}
                  className="bg-pink-600/30 backdrop-blur-sm text-white hover:bg-pink-600/50 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg border border-pink-500/30">
                  ログアウト
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href="/register"
                  className="bg-pink-400/30 backdrop-blur-sm text-white hover:bg-pink-400/50 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg border border-pink-300/30">
                  会員登録
                </Link>
                <Link
                  href="/login"
                  className="bg-pink-500/30 backdrop-blur-sm text-white hover:bg-pink-500/50 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-lg border border-pink-400/30">
                  ログイン
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* モバイルナビゲーション */}
        <div className="md:hidden mt-4 bg-pink-700/40 backdrop-blur-sm p-3 rounded-lg border border-pink-600/30">
          <ul className="flex flex-wrap justify-between gap-3">
            <li className="flex-1">
              <Link href="/" className="block text-center py-2 px-1 bg-white/10 rounded-lg text-white hover:bg-white/20 hover:text-pink-200 font-medium transition-colors">
                ホーム
              </Link>
            </li>
            <li className="flex-1">
              <Link href="/products" className="block text-center py-2 px-1 bg-white/10 rounded-lg text-white hover:bg-white/20 hover:text-pink-200 font-medium transition-colors">
                商品
              </Link>
            </li>
            <li className="flex-1">
              <Link href="/products?limited=true" className="block text-center py-2 px-1 bg-white/10 rounded-lg text-white hover:bg-white/20 hover:text-pink-200 font-medium transition-colors">
                限定
              </Link>
            </li>
            <li className="flex-1">
              <Link href="/cart" className="block text-center py-2 px-1 bg-white/10 rounded-lg text-white hover:bg-white/20 hover:text-pink-200 font-medium transition-colors">
                カート
              </Link>
            </li>
            <li className="flex-1">
              <Link
                href="/account"
                onClick={handleAccountNavigate}
                className="block text-center py-2 px-1 bg-white/10 rounded-lg text-white hover:bg-white/20 hover:text-pink-200 font-medium transition-colors">
                {accountNavLoading ? 'チェック中...' : 'アカウント'}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
