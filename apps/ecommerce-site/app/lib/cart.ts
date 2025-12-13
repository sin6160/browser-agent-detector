import { openDb } from './db';
import { getProductById } from './products';

// カート内商品型定義
export interface CartItem {
  id: number;
  user_id: number;
  product_id: number;
  quantity: number;
  recipient_email?: string; // ギフトカード用の受取人メールアドレス
  created_at: string;
  updated_at: string;
  // 商品情報（結合）
  product?: {
    name: string;
    price: number;
    image_path: string | null;
    stock_quantity: number;
    category: number;
    brand: number;
    is_limited: number;
    pc1?: number | null;
    pc2?: number | null;
  };
}

/**
 * ユーザーのカート内商品一覧を取得
 * @param userId ユーザーID
 */
export async function getUserCart(userId: number): Promise<CartItem[]> {
  const db = await openDb();

  try {
    // カート内商品を取得して商品情報と結合
    const items = await db.all(
      `SELECT ci.*, p.name, p.price, p.image_path, p.stock_quantity, p.category, p.brand, p.is_limited, p.pc1, p.pc2
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?
       ORDER BY ci.created_at DESC`,
      [userId]
    );

    return items.map(item => ({
      ...item,
      product: {
        name: item.name,
        price: item.price,
        image_path: item.image_path,
        stock_quantity: item.stock_quantity,
        category: item.category,
        brand: item.brand,
        is_limited: item.is_limited,
        pc1: item.pc1,
        pc2: item.pc2,
      }
    }));
  } catch (error) {
    console.error('カート取得エラー:', error);
    return [];
  } finally {
    await db.close();
  }
}

/**
 * カートに商品を追加
 * @param userId ユーザーID
 * @param productId 商品ID
 * @param quantity 数量
 */
export async function addToCart(userId: number, productId: number, quantity: number): Promise<boolean> {
  const db = await openDb();

  try {
    // 商品存在確認
    const product = await getProductById(productId);
    if (!product) {
      return false;
    }

    // 在庫確認
    if (product.stock_quantity < quantity) {
      return false;
    }

    // すでにカートに存在するか確認
    const existingItem = await db.get(
      'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );

    if (existingItem) {
      // 既存のカート内商品を更新
      const newQuantity = existingItem.quantity + quantity;

      // 在庫を超えないか確認
      if (newQuantity > product.stock_quantity) {
        return false;
      }

      const result = await db.run(
        `UPDATE cart_items
         SET quantity = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newQuantity, existingItem.id]
      );

      return result.changes !== undefined && result.changes > 0;
    } else {
      // 新規にカートに追加
      const result = await db.run(
        `INSERT INTO cart_items (user_id, product_id, quantity)
         VALUES (?, ?, ?)`,
        [userId, productId, quantity]
      );

      return !!result.lastID;
    }
  } catch (error) {
    console.error('カート追加エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * カート内商品の受取人メールアドレスを更新
 * @param userId ユーザーID
 * @param cartItemId カート内商品ID
 * @param recipientEmail 受取人メールアドレス
 */
export async function updateCartItemRecipientEmail(userId: number, cartItemId: number, recipientEmail: string): Promise<boolean> {
  const db = await openDb();

  try {
    // カート内商品の存在確認
    const cartItem = await db.get(
      'SELECT * FROM cart_items WHERE id = ? AND user_id = ?',
      [cartItemId, userId]
    );

    if (!cartItem) {
      return false;
    }

    // 受取人メールアドレスを更新
    const result = await db.run(
      `UPDATE cart_items
       SET recipient_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [recipientEmail, cartItemId, userId]
    );

    return result.changes !== undefined && result.changes > 0;
  } catch (error) {
    console.error('カート受取人メール更新エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * カート内商品の数量を更新
 * @param userId ユーザーID
 * @param cartItemId カート内商品ID
 * @param quantity 新しい数量
 */
export async function updateCartItemQuantity(userId: number, cartItemId: number, quantity: number): Promise<boolean> {
  const db = await openDb();

  try {
    // カート内商品の存在確認
    const cartItem = await db.get(
      'SELECT * FROM cart_items WHERE id = ? AND user_id = ?',
      [cartItemId, userId]
    );

    if (!cartItem) {
      return false;
    }

    // 商品の在庫確認
    const product = await getProductById(cartItem.product_id);
    if (!product || product.stock_quantity < quantity) {
      return false;
    }

    if (quantity <= 0) {
      // 数量が0以下なら削除
      return await removeFromCart(userId, cartItemId);
    }

    // 数量を更新
    const result = await db.run(
      `UPDATE cart_items
       SET quantity = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [quantity, cartItemId, userId]
    );

    return result.changes !== undefined && result.changes > 0;
  } catch (error) {
    console.error('カート更新エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * カートから商品を削除
 * @param userId ユーザーID
 * @param cartItemId カート内商品ID
 */
export async function removeFromCart(userId: number, cartItemId: number): Promise<boolean> {
  const db = await openDb();

  try {
    const result = await db.run(
      'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
      [cartItemId, userId]
    );

    return result.changes !== undefined && result.changes > 0;
  } catch (error) {
    console.error('カート削除エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * カートを空にする
 * @param userId ユーザーID
 */
export async function clearCart(userId: number): Promise<boolean> {
  const db = await openDb();

  try {
    const result = await db.run(
      'DELETE FROM cart_items WHERE user_id = ?',
      [userId]
    );

    return true;
  } catch (error) {
    console.error('カートクリアエラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * カート内商品の合計金額を計算
 * @param userId ユーザーID
 */
export async function getCartTotal(userId: number): Promise<number> {
  const db = await openDb();

  try {
    const result = await db.get(
      `SELECT SUM(p.price * ci.quantity) as total
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`,
      [userId]
    );

    return result?.total || 0;
  } catch (error) {
    console.error('カート合計計算エラー:', error);
    return 0;
  } finally {
    await db.close();
  }
}

/**
 * カート内の商品数を取得
 * @param userId ユーザーID
 */
export async function getCartItemCount(userId: number): Promise<number> {
  const db = await openDb();

  try {
    const result = await db.get(
      `SELECT COUNT(*) as count FROM cart_items WHERE user_id = ?`,
      [userId]
    );

    return result?.count || 0;
  } catch (error) {
    console.error('カート数取得エラー:', error);
    return 0;
  } finally {
    await db.close();
  }
}
