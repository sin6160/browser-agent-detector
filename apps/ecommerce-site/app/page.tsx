'use client';

export default function HomePage() {
  return (
    <div className="p-4">
      {/* カードセクション */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mb-10 max-w-5xl mx-auto w-full">
        <a
          href="/products"
          className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center p-10 border border-gray-100 w-full hover:-translate-y-1"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 via-white to-blue-100/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="bg-blue-100/80 p-5 rounded-2xl w-20 h-20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
              <span className="text-blue-600 text-2xl font-bold">Products</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold group-hover:text-blue-700 transition-colors">商品一覧</h2>
              <p className="text-gray-600 group-hover:text-gray-800 transition-colors text-base">様々な商品を見る</p>
            </div>
          </div>
        </a>

        <a
          href="/products?limited=true"
          className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center p-10 border border-gray-100 w-full hover:-translate-y-1"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-50/60 via-white to-red-100/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="bg-red-100/80 p-5 rounded-2xl w-20 h-20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
              <span className="text-red-600 text-2xl font-bold">Limited</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold group-hover:text-red-700 transition-colors">限定商品</h2>
              <p className="text-gray-600 group-hover:text-gray-800 transition-colors text-base">数量限定の特別商品</p>
            </div>
          </div>
          <div className="absolute top-4 right-4 bg-red-600 text-white text-[11px] tracking-wide font-bold px-3 py-1 rounded-full shadow-sm">PREMIUM</div>
        </a>

      </div>

      {/* セキュリティ情報カード */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-4">
          <div className="bg-pink-100 p-3 rounded-lg">
            <span className="text-pink-700 text-2xl font-bold">AI</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">AIエージェント攻撃の多層防御</h2>
            <p className="text-gray-600">
              reCAPTCHA Enterprise を常時稼働させ、行動ログとペルソナモデルを組み合わせて異常なブラウザ操作を即時スコアリングします。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white p-5 rounded-lg shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <h3 className="font-bold text-lg">reCAPTCHA v3 常時監視</h3>
            </div>
            <p className="text-gray-600">Google reCAPTCHA Enterprise が全リクエストのリスクをスコア化し、疑わしいトラフィックをブロックします。</p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <h3 className="font-bold text-lg">行動ペルソナ検知</h3>
            </div>
            <p className="text-gray-600">ログイン・購入フローの操作ログを蓄積し、LightGBM とクラスタ異常検知で「いつもと違う」行動を判定します。</p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <h3 className="font-bold text-lg">可視化バッジ</h3>
            </div>
            <p className="text-gray-600">画面左下のバッジで reCAPTCHA / AI Detector / クラスタスコアと閾値をリアルタイム表示し、状況を即確認できます。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
