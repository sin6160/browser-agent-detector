const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const crypto = require('crypto');

// SQLiteデータベースファイルパス
const DB_PATH = path.join(process.cwd(), 'ecommerce-db.sqlite');

// 簡易的なパスワードハッシュ関数（実際にはbcryptなどを使用すべき）
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// データベース初期化関数
async function initDb() {
  console.log('データベース初期化を開始します...');

  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    console.log('データベース接続成功');

    // ユーザーテーブル
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,

        -- 会員属性
        age INTEGER,
        gender INTEGER,
        prefecture INTEGER,
        occupation VARCHAR(50),
        full_name TEXT,
        phone_number VARCHAR(20),
        address_line1 TEXT,
        address_line2 TEXT,
        address_city TEXT,
        address_prefecture TEXT,
        postal_code VARCHAR(20),
        member_rank VARCHAR(20) DEFAULT 'bronze',
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- 購入履歴統計（非正規化）
        total_orders INTEGER DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        last_purchase_date DATETIME,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('usersテーブルを作成しました');

    // 商品テーブル
    await db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        category INTEGER,
        brand INTEGER,
        price DECIMAL(10,2) NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        is_limited BOOLEAN DEFAULT FALSE,
        image_path VARCHAR(255),
        description TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('productsテーブルを作成しました');

    // 注文テーブル
    await db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),

        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',

        -- セキュリティ関連
        security_mode VARCHAR(20),
        bot_score FLOAT NULL,
        security_action VARCHAR(20) NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('ordersテーブルを作成しました');

    // 注文商品テーブル
    await db.exec(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER REFERENCES orders(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('order_itemsテーブルを作成しました');

    // カートテーブル
    await db.exec(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('cart_itemsテーブルを作成しました');

    // セキュリティログテーブル
    await db.exec(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id VARCHAR(64) NOT NULL,
        user_id INTEGER NULL,

        -- リクエスト情報
        ip_address VARCHAR(45),
        user_agent TEXT,
        request_path VARCHAR(255),
        request_method VARCHAR(10),

        -- セキュリティ検知結果
        security_mode VARCHAR(20) NOT NULL,
        bot_score FLOAT NULL,
        risk_level VARCHAR(20) NULL,
        action_taken VARCHAR(20) NOT NULL,

        -- 追加コンテキスト
        detection_reasons TEXT NULL,
        processing_time_ms INTEGER NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('security_logsテーブルを作成しました');

    // 初期ユーザーデータの投入
    const userExists = await db.get('SELECT * FROM users LIMIT 1');

    if (!userExists) {
      // 若年学生クラスタ（男性、東京、22歳）
      await db.run(
        `INSERT INTO users (
          email, password_hash, age, gender, prefecture, occupation, member_rank,
          full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'student@example.com', hashPassword('password123'), 22, 1, 13, 'student', 'bronze',
          '架空 太郎', '090-0000-9999', '〒999-9999 東京都架空市幻町1-2-3', '架空マンション999号', '幻町', '架空市', '999-9999'
        ]
      );

      // 働く女性クラスタ（女性、神奈川、28歳）
      await db.run(
        `INSERT INTO users (
          email, password_hash, age, gender, prefecture, occupation, member_rank,
          full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'office@example.com', hashPassword('password123'), 28, 2, 14, 'office', 'silver',
          '虚空 花子', '080-1234-0000', '〒000-0000 神奈川県虚構市月見台0-0-0', 'フェイクタワー20F', '月見台', '虚構市', '000-0000'
        ]
      );

      // 技術系男性クラスタ（男性、東京、35歳）
      await db.run(
        `INSERT INTO users (
          email, password_hash, age, gender, prefecture, occupation, member_rank,
          full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'tech@example.com', hashPassword('password123'), 35, 1, 13, 'tech', 'gold',
          '電脳 次郎', '070-4242-4242', '〒424-2424 大阪府不存在区夢見ヶ丘42-42', 'テストラボB棟', '夢見ヶ丘', '不存在区', '424-2424'
        ]
      );

      // 主婦クラスタ（女性、大阪、65歳）
      await db.run(
        `INSERT INTO users (
          email, password_hash, age, gender, prefecture, occupation, member_rank,
          full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'homemaker@example.com', hashPassword('password123'), 65, 2, 27, 'other', 'silver',
          '夢野 桜子', '050-9999-0000', '〒123-4567 愛知県仮想市花吹町3-14-15', 'サンプルハウス1号', '花吹町', '仮想市', '123-4567'
        ]
      );

      // プレミアム会員クラスタ（男性、愛知、55歳）
      await db.run(
        `INSERT INTO users (
          email, password_hash, age, gender, prefecture, occupation, member_rank,
          full_name, phone_number, address_line1, address_line2, address_city, address_prefecture, postal_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'premium@example.com', hashPassword('password123'), 55, 1, 23, 'business', 'platinum',
          '星野 銀河', '0120-777-999', '〒777-7777 京都府架洲郡想田村7-7-7', '七星館', '想田村', '架洲郡', '777-7777'
        ]
      );

      console.log('サンプルユーザーデータを作成しました');
    } else {
      console.log('ユーザーデータは既に存在します');
    }

    // 初期商品データの投入
    const productExists = await db.get('SELECT * FROM products LIMIT 1');

    if (!productExists) {
      // 通常商品
      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['スマートフォン X', 1, 2, 89800, 50, 0, '/images/スマートフォン X.jpeg', '最新のスマートフォン']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['ノートパソコン Pro', 1, 2, 158000, 30, 0, '/images/ノートパソコン Pro.jpeg', 'プロフェッショナル向けノートパソコン']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['ワイヤレスイヤホン', 12, 3, 22800, 100, 0, '/images/ワイヤレスイヤホン.jpeg', '高音質ワイヤレスイヤホン']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['スマートウォッチ', 12, 4, 32800, 80, 0, '/images/スマートウォッチ.jpeg', '健康管理機能付きスマートウォッチ']
      );

      // 限定商品
      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Bluetoothスピーカー', 12, 3, 12800, 15, 1, '/images/Bluetoothスピーカー.jpeg', '高音質Bluetoothスピーカー']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['ポータブルSSD 1TB', 1, 5, 18000, 20, 1, '/images/ポータブルSSD 1TB.jpeg', '大容量・高速ポータブルSSD']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['4Kテレビ 55インチ', 2, 6, 128000, 8, 1, '/images/4Kテレビ 55インチ.jpeg', '高精細4Kスマートテレビ']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['ゲーミングマウス', 10, 7, 9800, 30, 1, '/images/ゲーミングマウス.jpeg', '高精度ゲーミングマウス']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['メカニカルキーボード', 10, 8, 15800, 25, 1, '/images/メカニカルキーボード.jpeg', '高性能メカニカルキーボード']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['デジタルカメラ', 12, 9, 68000, 12, 1, '/images/デジタルカメラ.jpeg', '高画質ミラーレスカメラ']
      );

      // ギフト券商品
      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['アマギフ 1,000円', 11, 1, 1000, 999, 0, '/images/gift_card_sample.png', 'アマゾンギフト券 1,000円分']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['アマギフ 10,000円', 11, 1, 10000, 999, 0, '/images/gift_card_sample.png', 'アマゾンギフト券 10,000円分']
      );

      // 追加商品
      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['ちゃぶ台', 9, 10, 25000, 15, 0, '/images/ちゃぶ台.png', '伝統的な日本のちゃぶ台。家族団らんに最適です。']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['カジュアル洋服セット', 7, 11, 8500, 25, 0, '/images/洋服.png', '日常使いにぴったりのカジュアルな洋服セット。']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['プレミアムペットフード', 6, 12, 3200, 40, 0, '/images/ペットの餌.png', '愛犬・愛猫の健康を考えたプレミアムフード。']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['高級口紅', 8, 13, 4500, 20, 0, '/images/口紅.png', '長時間持続する高級口紅。豊富なカラーバリエーション。']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['手作りお菓子セット', 4, 14, 1800, 30, 0, '/images/お菓子.png', '職人が手作りした美味しいお菓子の詰め合わせ。']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['省エネ洗濯機', 2, 15, 85000, 8, 0, '/images/洗濯機.png', '最新の省エネ技術を搭載した高性能洗濯機。']
      );

      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['日本史の本', 3, 16, 2200, 35, 0, '/images/歴史の本.png', '日本の歴史を詳しく解説した学習書。']
      );

      // 限定品スニーカー
      await db.run(
        'INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['限定品スニーカー', 7, 19, 25800, 5, 1, '/images/限定品スニーカー.png', '数量限定のプレミアムスニーカー。希少なデザインと高品質な素材を使用。']
      );

      console.log('サンプル商品データを作成しました');
    } else {
      console.log('商品データは既に存在します');
    }

    // 購入履歴シード用ヘルパー（ユーザー作成後に実行する）
    const productPriceCache = {};
    async function priceOf(id) {
      if (productPriceCache[id]) return productPriceCache[id];
      const row = await db.get('SELECT price FROM products WHERE id = ?', [id]);
      productPriceCache[id] = row?.price || 0;
      return productPriceCache[id];
    }

    async function addOrder(userEmail, createdAt, itemSpecs) {
      const user = await db.get('SELECT id FROM users WHERE email = ?', [userEmail]);
      if (!user) return;
      let total = 0;
      const itemsWithPrice = [];
      for (const spec of itemSpecs) {
        const unitPrice = await priceOf(spec.product_id);
        total += unitPrice * spec.quantity;
        itemsWithPrice.push({ ...spec, unit_price: unitPrice });
      }
      const orderResult = await db.run(
        'INSERT INTO orders (user_id, total_amount, status, created_at) VALUES (?, ?, ?, ?)',
        [user.id, total, 'completed', createdAt]
      );
      const orderId = orderResult.lastID;
      for (const item of itemsWithPrice) {
        await db.run(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price, created_at) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.unit_price, createdAt]
        );
      }
    }

    // personaを反映した購入履歴サンプル
    await addOrder('student@example.com', '2025-10-10 14:00:00', [
      { product_id: 11, quantity: 2 },
      { product_id: 17, quantity: 1 }
    ]);
    await addOrder('student@example.com', '2025-10-18 20:15:00', [
      { product_id: 12, quantity: 1 },
      { product_id: 5, quantity: 1 }
    ]);

    await addOrder('office@example.com', '2025-09-28 19:30:00', [
      { product_id: 12, quantity: 2 },
      { product_id: 16, quantity: 1 },
      { product_id: 19, quantity: 1 }
    ]);
    await addOrder('office@example.com', '2025-10-22 12:10:00', [
      { product_id: 11, quantity: 1 },
      { product_id: 15, quantity: 1 }
    ]);

    await addOrder('tech@example.com', '2025-10-05 23:40:00', [
      { product_id: 2, quantity: 1 },
      { product_id: 8, quantity: 1 },
      { product_id: 9, quantity: 1 }
    ]);
    await addOrder('tech@example.com', '2025-10-25 01:20:00', [
      { product_id: 6, quantity: 1 }
    ]);

    await addOrder('homemaker@example.com', '2025-09-15 10:05:00', [
      { product_id: 18, quantity: 1 },
      { product_id: 17, quantity: 2 },
      { product_id: 15, quantity: 2 }
    ]);
    await addOrder('homemaker@example.com', '2025-10-12 14:30:00', [
      { product_id: 13, quantity: 1 }
    ]);

    await addOrder('premium@example.com', '2025-09-05 21:00:00', [
      { product_id: 7, quantity: 1 },
      { product_id: 20, quantity: 1 },
      { product_id: 12, quantity: 1 }
    ]);
    await addOrder('premium@example.com', '2025-10-18 18:45:00', [
      { product_id: 2, quantity: 1 },
      { product_id: 10, quantity: 1 }
    ]);

    // 集計を更新
    await db.exec(`
      UPDATE users SET
        total_orders = (
          SELECT COUNT(*) FROM orders o WHERE o.user_id = users.id
        ),
        total_spent = (
          SELECT IFNULL(SUM(total_amount), 0) FROM orders o WHERE o.user_id = users.id
        ),
        last_purchase_date = (
          SELECT MAX(created_at) FROM orders o WHERE o.user_id = users.id
        ),
        updated_at = CURRENT_TIMESTAMP
    `);

    // セッションテーブルの作成
    await db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // セッションIDにインデックスを作成
    await db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions (session_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)`);

    console.log('セッションテーブルを作成しました');

    await db.close();
    console.log('データベース初期化が完了しました');
  } catch (error) {
    console.error('データベース初期化エラー:', error);
  }
}

// 初期化実行
initDb();
