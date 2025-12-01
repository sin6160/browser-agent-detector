import { openDb } from './db';

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
