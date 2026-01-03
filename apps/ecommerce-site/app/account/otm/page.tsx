'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AccountOtpPage() {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying'>('idle');
  const [scoreMessage, setScoreMessage] = useState('ナビゲーション時のスコアがありません');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem('accountNavAiScore');
      if (raw) {
        const parsed = JSON.parse(raw);
        const parsedScore = Number(parsed?.score);
        if (Number.isFinite(parsedScore)) {
          setScore(parsedScore);
          setScoreMessage(`スコア: ${parsedScore.toFixed(3)}（閾値 0.5 以下で OTP 要求）`);
        } else {
          setScoreMessage('スコアが読み取れませんでした');
        }
        sessionStorage.removeItem('accountNavAiScore');
      }
    } catch (error) {
      console.error('Failed to load nav score:', error);
      setScoreMessage('スコアの取得に失敗しました');
    }
  }, []);

  const handleVerify = () => {
    setStatus('verifying');
    setTimeout(() => {
      alert('OTPコードを確認しました（ダミー実装）');
      setStatus('idle');
      router.push('/account');
    }, 800);
  };

  const verifying = status === 'verifying';
  const disabled = !otpCode.trim() || verifying;

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">追加認証（OTP）ダミー</h1>
      <p className="text-sm text-gray-700 mb-4">
        アカウントボタン押下時の AI Detector スコアが閾値以下だったため、ワンタイムメッセージによる確認を要求しています（ダミー画面）。
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-amber-900 font-semibold">スコア情報</p>
        <p className="text-sm text-amber-800 mt-1">{scoreMessage}</p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          OTPコード（ダミー）
        </label>
        <input
          type="text"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
          placeholder="受信したコードを入力（ダミー）"
          className="w-full border border-amber-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          disabled={verifying}
        />
        <button
          onClick={handleVerify}
          disabled={disabled}
          className={`w-full px-4 py-2 rounded text-white ${
            disabled ? 'bg-amber-300 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600'
          }`}
        >
          {verifying ? '確認中...' : 'OTPコードを確認'}
        </button>
      </div>

      <div className="mt-6 flex justify-between text-sm">
        <Link href="/" className="text-indigo-600 hover:underline">
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
