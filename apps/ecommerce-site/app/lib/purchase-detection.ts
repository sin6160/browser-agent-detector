/**
 * 購入検知サーバー呼び出しロジック
 * 検知サーバー（/detect_cluster_anomaly）を呼び出して異常検知を実行
 */

import { User } from './auth';
import { CartItem } from './cart';

// 検知サーバーのリクエスト形式
export interface ClusterAnomalyRequest {
  age: number;
  gender: number;
  prefecture: number;
  product_category: number;
  quantity: number;
  price: number;
  total_amount: number;
  purchase_time: number;
  limited_flag: number;
  payment_method: number;
  manufacturer: number;
}

// 検知サーバーのレスポンス形式
export interface ClusterAnomalyResponse {
  cluster_id: number;
  prediction: number;
  anomaly_score: number;
  is_anomaly: boolean;
  threshold: number;
  reason_codes?: string[];
  request_id: string;
}

// 検知サーバーのエラーレスポンス形式
export interface ClusterAnomalyErrorResponse {
  error: string;
  message: string;
  cluster_id?: number;
  anomaly_score?: number;
  threshold?: number;
  request_id?: string;
}

// 変換関数は削除されました - DBから直接数値を取得



/**
 * カート情報から購入データを生成
 * @param cartItems カートアイテム
 */
function generatePurchaseDataFromCart(cartItems: CartItem[]): {
  product_category: number;
  quantity: number;
  price: number;
  total_amount: number;
  purchase_time: number;
  limited_flag: number;
  payment_method: number;
  manufacturer: number;
} {
  // カートの最初の商品を代表として使用（実際の実装では複数商品の集約が必要）
  const firstItem = cartItems[0];
  const product = firstItem.product;

  if (!product) {
    throw new Error('商品情報が見つかりません');
  }

  // 総額を計算
  const totalAmount = cartItems.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.quantity;
  }, 0);

  // 総数量を計算
  const totalQuantity = cartItems.reduce((sum, item) => item.quantity, 0);

  // 限定品フラグ（カート内に限定品があるかチェック）
  const hasLimitedItem = cartItems.some(item => item.product?.is_limited);

  // 平均価格を計算（複数商品の場合）
  const averagePrice = totalAmount / totalQuantity;

  console.log('商品カテゴリ:', {
    originalCategory: product.category,
    productName: product.name
  });

  return {
    product_category: product.category || 12,
    quantity: totalQuantity,
    price: Math.round(averagePrice), // 平均価格を使用
    total_amount: totalAmount,
    purchase_time: new Date().getHours(), // 現在時刻
    limited_flag: hasLimitedItem ? 1 : 0,
    payment_method: 3, // デフォルト決済方法（クレジットカード）
    manufacturer: product.brand || 11
  };
}

/**
 * 検知サーバーを呼び出して異常検知を実行
 * @param user ユーザー情報
 * @param cartItems カートアイテム
 * @returns 検知結果
 */
export async function detectPurchaseAnomaly(
  user: User,
  cartItems: CartItem[]
): Promise<ClusterAnomalyResponse> {
  try {
    // ユーザー情報から検知用データを生成（DBから直接数値を取得）
    const age = user.age;
    const gender = user.gender;
    const prefecture = user.prefecture;

    // カート情報から購入データを生成
    const purchaseData = generatePurchaseDataFromCart(cartItems);

    // 検知サーバーへのリクエストデータを構築
    const requestData: ClusterAnomalyRequest = {
      age,
      gender,
      prefecture,
      ...purchaseData
    };

    console.log('検知サーバー呼び出し:', {
      userId: user.id,
      requestData
    });

    // 検知サーバーを呼び出し
    const response = await fetch('http://localhost:8000/detect_cluster_anomaly', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      // エラーレスポンスの詳細を取得
      let errorMessage = `検知サーバーエラー: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        console.log('検知サーバーエラーレスポンス:', errorData);
        errorMessage += ` - ${JSON.stringify(errorData)}`;
      } catch (e) {
        console.log('エラーレスポンスの解析に失敗:', e);
      }

      // 403 Forbiddenの場合は異常検知として処理
      if (response.status === 403) {
        const errorData: ClusterAnomalyErrorResponse = await response.json();
        throw new Error(`ANOMALY_DETECTED: ${errorData.message}`);
      }

      // その他のエラー
      throw new Error(errorMessage);
    }

    const result: ClusterAnomalyResponse = await response.json();

    console.log('検知サーバー応答:', {
      userId: user.id,
      result
    });

    return result;

  } catch (error) {
    console.error('購入検知エラー:', error);

    // ネットワークエラーやその他のエラーの場合はデフォルトで許可
    if (error instanceof Error && error.message.includes('ANOMALY_DETECTED')) {
      throw error; // 異常検知の場合は再スロー
    }

    throw new Error('AI_DETECTOR_UNAVAILABLE');
  }
}

/**
 * 検知結果に基づいて購入を許可するかどうかを判定
 * @param detectionResult 検知結果
 * @returns 購入許可フラグ
 */
export function shouldAllowPurchase(detectionResult: ClusterAnomalyResponse): boolean {
  return !detectionResult.is_anomaly;
}
