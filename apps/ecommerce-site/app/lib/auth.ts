import crypto from 'crypto';
import { openDb } from './db';
import { getUserOrdersWithItems, OrderWithItems } from './orders';

// ユーザー型定義
export interface User {
  id: number;
  email: string;
  age_group?: string;  // getUserByEmail では age_group を使用
  age?: number;        // DB では age を使用
  gender?: number;
  prefecture?: number;
  occupation: string;
  full_name?: string;
  phone_number?: string;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_prefecture?: string;
  postal_code?: string;
  member_rank: string;
  registration_date: string;
  total_orders: number;
  total_spent: number;
  last_purchase_date: string | null;
  orders?: OrderWithItems[];
  created_at: string;
  updated_at: string;
}

/**
 * パスワードハッシュ化関数（実際にはbcryptなどを使用すべき）
 * @param password ハッシュ化するパスワード
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * ログイン認証処理
 * @param email メールアドレス
 * @param password パスワード
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const db = await openDb();

  try {
    // テスト用アカウントの処理は削除し、通常のフローでハッシュ化して認証するように変更
    
    // 通常のユーザー認証（パスワードハッシュを使用）
    const hashedPassword = hashPassword(password);
    
    const query = `
      SELECT 
        id, 
        email, 
        occupation, 
        member_rank, 
        registration_date,
        total_orders, 
        total_spent, 
        last_purchase_date, 
        created_at, 
        updated_at,
        age,
        gender,
        prefecture,
        full_name,
        phone_number,
        address_line1,
        address_line2,
        address_city,
        address_prefecture,
        postal_code
      FROM users 
      WHERE email = ? AND password_hash = ?
    `;

    const user = await db.get(query, [email, hashedPassword]);
    
    // ユーザーが見つかった場合、age を age_group として設定
    if (user) {
      // age カラムの値から age_group を生成
      const age = user.age;
      if (typeof age === 'number') {
        if (age < 20) user.age_group = '~10s';
        else if (age < 30) user.age_group = '20s';
        else if (age < 40) user.age_group = '30s';
        else if (age < 50) user.age_group = '40s';
        else if (age < 60) user.age_group = '50s';
        else user.age_group = '60s+';
      } else {
        // age が undefined の場合、デフォルトの値を設定
        user.age_group = '30s'; // デフォルト値
      }
    }
    
    return user || null;
  } catch (error) {
    console.error('認証エラー:', error);
    return null;
  } finally {
    await db.close();
  }
}

/**
 * ユーザー登録処理
 * @param email メールアドレス
 * @param password パスワード
 * @param age_group 年齢層
 * @param occupation 職業
 */
export async function registerUser(
  email: string,
  password: string,
  age_group: string,
  occupation: string
): Promise<User | null> {
  const db = await openDb();

  try {
    // 既存のユーザーチェック
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return null;
    }

    const hashedPassword = hashPassword(password);
    const member_rank = 'bronze'; // デフォルト会員ランク

    // 新規ユーザー登録
    const result = await db.run(
      `INSERT INTO users (
        email, password_hash, age, gender, prefecture, occupation, member_rank,
        full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        hashedPassword,
        30,
        1,
        13,
        occupation,
        member_rank,
        '仮名 テスト',
        '090-1111-2222',
        '〒101-0000 東京都架空市テスト町1-1-1',
        'ダミーコート101号',
        'テスト町',
        '架空市',
        '101-0000'
      ]
    );

    if (result.lastID) {
      const newUser = await db.get(
        `SELECT id, email, age, gender, prefecture, occupation, member_rank, registration_date,
         total_orders, total_spent, last_purchase_date, created_at, updated_at
         FROM users WHERE id = ?`,
        [result.lastID]
      );
      return newUser;
    }

    return null;
  } catch (error) {
    console.error('ユーザー登録エラー:', error);
    return null;
  } finally {
    await db.close();
  }
}

/**
 * ユーザーID からユーザー情報を取得
 * @param userId ユーザーID
 */
export async function getUserById(userId: number): Promise<User | null> {
  const db = await openDb();

  try {
    const user = await db.get(
      `SELECT id, email, age, gender, prefecture, occupation, member_rank, registration_date,
       total_orders, total_spent, last_purchase_date, created_at, updated_at,
       full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
       FROM users WHERE id = ?`,
      [userId]
    );
    if (user && typeof user.age === 'number' && !user.age_group) {
      if (user.age < 20) user.age_group = '~10s';
      else if (user.age < 30) user.age_group = '20s';
      else if (user.age < 40) user.age_group = '30s';
      else if (user.age < 50) user.age_group = '40s';
      else if (user.age < 60) user.age_group = '50s';
      else user.age_group = '60s+';
    }

    return user || null;
  } catch (error) {
    console.error('ユーザー取得エラー:', error);
    return null;
  } finally {
    await db.close();
  }
}

/**
 * メールアドレスからユーザー情報を取得
 * @param email メールアドレス
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await openDb();

  try {
    const user = await db.get(
      `SELECT id, email, age_group, occupation, member_rank, registration_date,
       total_orders, total_spent, last_purchase_date, created_at, updated_at,
       full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
       FROM users WHERE email = ?`,
      [email]
    );

    return user || null;
  } catch (error) {
    console.error('ユーザー取得エラー:', error);
    return null;
  } finally {
    await db.close();
  }
}

/**
 * ユーザー情報を更新
 * @param userId ユーザーID
 * @param userData 更新データ
 */
export async function updateUser(userId: number, userData: Partial<User>): Promise<boolean> {
  const db = await openDb();

  try {
    const updateFields: string[] = [];
    const values: any[] = [];

    // 更新対象フィールド
    const allowedFields = ['age_group', 'occupation', 'member_rank'];

    // 更新SQLを構築
    for (const [key, value] of Object.entries(userData)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updateFields.length === 0) {
      return false;
    }

    // 更新日時を自動追加
    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    // WHERE句のユーザーIDを追加
    values.push(userId);

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = await db.run(sql, values);

    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('ユーザー更新エラー:', error);
    return false;
  } finally {
    await db.close();
  }
}
