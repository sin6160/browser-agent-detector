/**
 * 購入検知サーバー呼び出しロジック
 * 検知サーバー（/detect_cluster_anomaly）を呼び出して異常検知を実行
 */

import { User } from './auth';
import { CartItem } from './cart';
import { getAIDetectorServerConfig } from './server/ai-detector';

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
  pc1?: number;
  pc2?: number;
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
function generatePurchaseDataForItem(cartItem: CartItem): ClusterAnomalyRequest {
  const product = cartItem.product;
  if (!product) {
    throw new Error('商品情報が見つかりません');
  }

  const qty = Number(cartItem.quantity || 0);
  const price = Number(product.price || 0);
  const totalAmount = Math.round(price * qty);
  const purchaseTime = new Date().getHours();

  const pc1 = Number.isFinite(product.pc1 as number) ? Number(product.pc1) : 0;
  const pc2 = Number.isFinite(product.pc2 as number) ? Number(product.pc2) : 0;

  return {
    product_category: Number(product.category),
    quantity: qty,
    price: Math.round(price),
    total_amount: totalAmount,
    purchase_time: purchaseTime,
    limited_flag: product.is_limited ? 1 : 0,
    payment_method: 3, // デフォルト決済方法（クレジットカード）
    manufacturer: Number(product.brand),
    pc1,
    pc2,
    age: 0, // ダミー（呼び出し元で上書き）
    gender: 0,
    prefecture: 0,
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
    const { endpoint, apiKey } = getAIDetectorServerConfig();
    const endpointUrl = `${endpoint.replace(/\/$/, '')}/detect_cluster_anomaly`;

    // ユーザー情報から検知用データを生成（DBから直接数値を取得）
    const age = user.age;
    const gender = user.gender;
    const prefecture = user.prefecture;

    // カートの各商品ごとにクラスタ判定を実行し、最も疑わしい結果を採用
    let worstResult: ClusterAnomalyResponse | null = null;

    for (const cartItem of cartItems) {
      const purchaseData = generatePurchaseDataForItem(cartItem);
      const requestData: ClusterAnomalyRequest = {
        ...purchaseData,
        age,
        gender,
        prefecture,
      };

      console.log('検知サーバー呼び出し(単品):', {
        userId: user.id,
        productId: cartItem.product_id,
        requestData,
      });

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        let errorMessage = `検知サーバーエラー: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          console.log('検知サーバーエラーレスポンス:', errorData);
          errorMessage += ` - ${JSON.stringify(errorData)}`;
        } catch (e) {
          console.log('エラーレスポンスの解析に失敗:', e);
        }

        if (response.status === 403) {
          const errorData: ClusterAnomalyErrorResponse = await response.json();
          throw new Error(`ANOMALY_DETECTED: ${errorData.message}`);
        }

        throw new Error(errorMessage);
      }

      const result: ClusterAnomalyResponse = await response.json();
      console.log('検知サーバー応答(単品):', {
        userId: user.id,
        productId: cartItem.product_id,
        result,
      });

      // is_anomaly を最優先。両方正常の場合は anomaly_score が低いものを優先（より疑わしいとみなす）。
      if (
        !worstResult ||
        result.is_anomaly ||
        (!worstResult.is_anomaly && result.anomaly_score < worstResult.anomaly_score)
      ) {
        worstResult = result;
      }
      if (result.is_anomaly) {
        // 早期終了してもよいが、ログ収集のため全件回すことも可能。ここでは早期終了。
        break;
      }
    }

    if (!worstResult) {
      throw new Error('検知結果を取得できませんでした');
    }

    return worstResult;

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
