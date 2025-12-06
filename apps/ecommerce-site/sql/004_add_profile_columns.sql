-- users テーブルにプロフィール項目を追加
ALTER TABLE users ADD COLUMN full_name TEXT;
ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD COLUMN address_line1 TEXT;
ALTER TABLE users ADD COLUMN address_line2 TEXT;
ALTER TABLE users ADD COLUMN address_city TEXT;
ALTER TABLE users ADD COLUMN address_prefecture TEXT;
ALTER TABLE users ADD COLUMN postal_code TEXT;

