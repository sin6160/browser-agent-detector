import Link from 'next/link';
import Image from 'next/image';
import { getAllProducts } from '@/app/lib/products';
import { productReviews } from '@/app/lib/reviews';

export const dynamic = 'force-dynamic';

const WIRELESS_MOUSE_NAME = 'ワイヤレスマウス';

export default async function WirelessMouseReviewsPage() {
  const products = await getAllProducts();
  const wirelessMouse = products.find(product => product.name === WIRELESS_MOUSE_NAME);
  const reviews = productReviews[WIRELESS_MOUSE_NAME] || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <Link href="/products" className="text-pink-600 hover:text-pink-700">商品一覧</Link>
        <span>/</span>
        <span>{WIRELESS_MOUSE_NAME} レビュー</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-4 p-4">
          <div className="w-full sm:w-48">
            <div className="bg-gray-50 border border-gray-100 rounded-md h-48 flex items-center justify-center overflow-hidden">
              {wirelessMouse?.image_path ? (
                <Image
                  src={wirelessMouse.image_path}
                  alt={WIRELESS_MOUSE_NAME}
                  width={192}
                  height={192}
                  className="object-contain"
                />
              ) : (
                <span className="text-gray-400 text-sm">画像なし</span>
              )}
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 mb-1">{WIRELESS_MOUSE_NAME}</h1>
            {wirelessMouse ? (
              <>
                <p className="text-pink-600 font-semibold mb-1">¥{wirelessMouse.price.toLocaleString()}</p>
                {wirelessMouse.description && (
                  <p className="text-sm text-gray-700 mb-2 leading-relaxed">{wirelessMouse.description}</p>
                )}
                <p className="text-xs text-gray-500">商品ID: {wirelessMouse.id}</p>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                商品情報の取得に失敗しましたが、レビューは閲覧できます。
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">レビュー</h2>
            <span className="text-xs text-gray-500">投稿済み {reviews.length}件</span>
          </div>

          {reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((review, index) => (
                <div key={index} className="border border-gray-100 rounded-md bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{review.reviewer}</span>
                    <span className="text-xs text-gray-500">{review.date}</span>
                  </div>
                  <div className="text-xs text-gray-600 mb-1">評価: {review.rating}/5</div>
                  <p
                    className="text-sm text-gray-800 whitespace-pre-line leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: review.contentHtml }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">まだレビューはありません。</p>
          )}
        </div>
      </div>
    </div>
  );
}
