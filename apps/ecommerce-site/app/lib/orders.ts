import { openDb } from './db';
import { getUserCart } from './cart';

export interface OrderItemRow {
  product_id: number;
  quantity: number;
  unit_price: number;
  name?: string;
}

export interface OrderWithItems {
  id: number;
  total_amount: number;
  created_at: string;
  items: OrderItemRow[];
}

type CreateOrderOptions = {
  botScore?: number | null;
  securityAction?: string | null;
};

export async function getUserOrdersWithItems(userId: number): Promise<OrderWithItems[]> {
  const db = await openDb();
  try {
    const orders = await db.all(
      `SELECT id, total_amount, created_at
         FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC`,
      [userId]
    );

    const results: OrderWithItems[] = [];
    for (const o of orders) {
      const items = await db.all(
        `SELECT oi.product_id, oi.quantity, oi.unit_price, p.name
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ?`,
        [o.id]
      );
      results.push({ ...o, items });
    }
    return results;
  } finally {
    await db.close();
  }
}

// 注文一覧（簡易版）
export async function getUserOrders(userId: number): Promise<OrderWithItems[]> {
  return getUserOrdersWithItems(userId);
}

// 単一注文の詳細を取得（本人以外は null）
export async function getOrderDetails(orderId: number, userId: number): Promise<OrderWithItems | null> {
  const db = await openDb();
  try {
    const order = await db.get(
      `SELECT id, total_amount, created_at
         FROM orders
        WHERE id = ? AND user_id = ?`,
      [orderId, userId]
    );
    if (!order) return null;

    const items = await db.all(
      `SELECT oi.product_id, oi.quantity, oi.unit_price, p.name
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?`,
      [orderId]
    );
    return { ...order, items };
  } finally {
    await db.close();
  }
}

// カートから注文を作成し、在庫・ユーザー統計を更新
export async function createOrderFromCart(
  userId: number,
  options: CreateOrderOptions = {}
): Promise<number | null> {
  const db = await openDb();
  try {
    const cartItems = await getUserCart(userId);
    if (!cartItems.length) {
      return null;
    }

    // 在庫確認と合計計算
    let total = 0;
    for (const item of cartItems) {
      if (!item.product || item.product.stock_quantity < item.quantity) {
        return null;
      }
      total += item.product.price * item.quantity;
    }

    // 注文作成
    const result = await db.run(
      `INSERT INTO orders (user_id, total_amount, status, security_mode, bot_score, security_action)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        total,
        'completed',
        'ai-detector',
        options.botScore ?? null,
        options.securityAction ?? null,
      ]
    );
    const orderId = result.lastID;
    if (!orderId) {
      return null;
    }

    // 注文アイテム作成＋在庫更新
    for (const item of cartItems) {
      await db.run(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.product?.price ?? 0]
      );
      await db.run(
        `UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // ユーザー統計更新
    await db.run(
      `UPDATE users
          SET total_orders = COALESCE(total_orders, 0) + 1,
              total_spent = COALESCE(total_spent, 0) + ?,
              last_purchase_date = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [total, userId]
    );

    // カートを空にする
    await db.run(`DELETE FROM cart_items WHERE user_id = ?`, [userId]);

    return orderId;
  } catch (error) {
    console.error('createOrderFromCart error:', error instanceof Error ? `${error.message}\n${error.stack || ''}` : error);
    return null;
  } finally {
    await db.close();
  }
}
