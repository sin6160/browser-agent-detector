import { openDb } from './db';

// 商品型定義
export interface Product {
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
  created_at: string;
}

/**
 * 全商品一覧を取得
 */
export async function getAllProducts(): Promise<Product[]> {
  const db = await openDb();

  try {
    const products = await db.all('SELECT * FROM products ORDER BY id');
    return products;
  } catch (error) {
    console.error('商品一覧取得エラー:', error);
    return [];
  } finally {
    await db.close();
  }
}

/**
 * 限定商品のみ取得
 */
export async function getLimitedProducts(): Promise<Product[]> {
  const db = await openDb();

  try {
    const products = await db.all(
      'SELECT * FROM products WHERE is_limited = 1 ORDER BY id'
    );
    return products;
  } catch (error) {
    console.error('限定商品取得エラー:', error);
    return [];
  } finally {
    await db.close();
  }
}

/**
 * カテゴリー別商品一覧を取得
 * @param category カテゴリー名
 */
export async function getProductsByCategory(category: string): Promise<Product[]> {
  const db = await openDb();

  try {
    const products = await db.all(
      'SELECT * FROM products WHERE category = ? ORDER BY id',
      [category]
    );
    return products;
  } catch (error) {
    console.error('カテゴリー別商品取得エラー:', error);
    return [];
  } finally {
    await db.close();
  }
}

/**
 * 商品詳細を取得
 * @param productId 商品ID
 */
export async function getProductById(productId: number): Promise<Product | null> {
  const db = await openDb();

  try {
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    return product || null;
  } catch (error) {
    console.error('商品詳細取得エラー:', error);
    return null;
  } finally {
    await db.close();
  }
}

/**
 * 商品在庫を更新
 * @param productId 商品ID
 * @param quantity 更新後の在庫数
 */
export async function updateProductStock(productId: number, quantity: number): Promise<boolean> {
  const db = await openDb();

  try {
    if (quantity < 0) {
      return false;
    }

    const result = await db.run(
      'UPDATE products SET stock_quantity = ? WHERE id = ?',
      [quantity, productId]
    );

    return result.changes !== undefined && result.changes > 0;
  } catch (error) {
    console.error('商品在庫更新エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * 商品在庫を減少させる（購入時）
 * @param productId 商品ID
 * @param quantity 減少させる量
 */
export async function decreaseProductStock(productId: number, quantity: number): Promise<boolean> {
  const db = await openDb();

  try {
    // トランザクション開始
    await db.run('BEGIN TRANSACTION');

    // 現在の在庫を確認
    const product = await db.get(
      'SELECT stock_quantity FROM products WHERE id = ?',
      [productId]
    );

    if (!product || product.stock_quantity < quantity) {
      // 在庫不足
      await db.run('ROLLBACK');
      return false;
    }

    // 在庫を減少
    const newQuantity = product.stock_quantity - quantity;
    const result = await db.run(
      'UPDATE products SET stock_quantity = ? WHERE id = ?',
      [newQuantity, productId]
    );

    // トランザクション完了
    await db.run('COMMIT');

    return result.changes !== undefined && result.changes > 0;
  } catch (error) {
    // エラー時はロールバック
    await db.run('ROLLBACK');
    console.error('商品在庫減少エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * 商品検索
 * @param keyword 検索キーワード
 */
export async function searchProducts(keyword: string): Promise<Product[]> {
  const db = await openDb();

  try {
    const searchTerm = `%${keyword}%`;

    const products = await db.all(
      `SELECT * FROM products
       WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR brand LIKE ?
       ORDER BY id`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );

    return products;
  } catch (error) {
    console.error('商品検索エラー:', error);
    return [];
  } finally {
    await db.close();
  }
}

/**
 * 新しい商品を追加
 * @param productData 商品データ
 */
export async function addProduct(productData: {
  name: string;
  category: number;
  brand: number;
  price: number;
  stock_quantity: number;
  is_limited?: boolean;
  image_path?: string | null;
  description?: string | null;
}): Promise<number | null> {
  const db = await openDb();

  try {
    const result = await db.run(
      `INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productData.name,
        productData.category,
        productData.brand,
        productData.price,
        productData.stock_quantity,
        productData.is_limited || false,
        productData.image_path || null,
        productData.description || null
      ]
    );

    return result.lastID || null;
  } catch (error) {
    console.error('商品追加エラー:', error);
    return null;
  } finally {
    await db.close();
  }
}
