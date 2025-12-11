-- DDL for Cloudflare D1

-- users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  age INTEGER,
  gender INTEGER,
  prefecture INTEGER,
  occupation VARCHAR(50),
  member_rank VARCHAR(20) DEFAULT 'bronze',
  registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  last_purchase_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- products
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
  pc1 REAL,
  pc2 REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  security_mode VARCHAR(20),
  bot_score FLOAT NULL,
  security_action VARCHAR(20) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- order_items
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- security_logs
CREATE TABLE IF NOT EXISTS security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id VARCHAR(64) NOT NULL,
  user_id INTEGER NULL REFERENCES users(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_path VARCHAR(255),
  request_method VARCHAR(10),
  security_mode VARCHAR(20) NOT NULL,
  bot_score FLOAT NULL,
  risk_level VARCHAR(20) NULL,
  action_taken VARCHAR(20) NOT NULL,
  detection_reasons TEXT NULL,
  processing_time_ms INTEGER NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- cart_items
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  recipient_email VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER
);
