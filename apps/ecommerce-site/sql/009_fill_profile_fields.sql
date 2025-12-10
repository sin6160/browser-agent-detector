-- 既存シードユーザーのプロフィール情報を補完する（空欄のみ上書き）
UPDATE users
SET
  full_name = COALESCE(full_name, '佐藤 さくら'),
  phone_number = COALESCE(phone_number, '090-1111-2222'),
  address_prefecture = COALESCE(address_prefecture, '愛知県'),
  address_city = COALESCE(address_city, '名古屋市中区'),
  address_line1 = COALESCE(address_line1, '丸の内1-1-1'),
  address_line2 = COALESCE(address_line2, 'サンプルハウス101号'),
  postal_code = COALESCE(postal_code, '460-0002')
WHERE email = 'homemaker@example.com';

UPDATE users
SET
  full_name = COALESCE(full_name, '田中 太郎'),
  phone_number = COALESCE(phone_number, '090-0000-9999'),
  address_prefecture = COALESCE(address_prefecture, '東京都'),
  address_city = COALESCE(address_city, '架空市幻町'),
  address_line1 = COALESCE(address_line1, '1-2-3'),
  address_line2 = COALESCE(address_line2, '架空マンション999号'),
  postal_code = COALESCE(postal_code, '999-9999')
WHERE email = 'student@example.com';

UPDATE users
SET
  full_name = COALESCE(full_name, '鈴木 花子'),
  phone_number = COALESCE(phone_number, '080-1234-0000'),
  address_prefecture = COALESCE(address_prefecture, '神奈川県'),
  address_city = COALESCE(address_city, '虚構市月見台'),
  address_line1 = COALESCE(address_line1, '0-0-0'),
  address_line2 = COALESCE(address_line2, 'フェイクタワー20F'),
  postal_code = COALESCE(postal_code, '000-0000')
WHERE email = 'office@example.com';

UPDATE users
SET
  full_name = COALESCE(full_name, '高橋 次郎'),
  phone_number = COALESCE(phone_number, '070-4242-4242'),
  address_prefecture = COALESCE(address_prefecture, '大阪府'),
  address_city = COALESCE(address_city, '不存在区夢見ヶ丘'),
  address_line1 = COALESCE(address_line1, '42-42'),
  address_line2 = COALESCE(address_line2, 'テストラボB棟'),
  postal_code = COALESCE(postal_code, '424-2424')
WHERE email = 'tech@example.com';

UPDATE users
SET
  full_name = COALESCE(full_name, '星野 銀河'),
  phone_number = COALESCE(phone_number, '0120-777-999'),
  address_prefecture = COALESCE(address_prefecture, '京都府'),
  address_city = COALESCE(address_city, '架洲郡想田村'),
  address_line1 = COALESCE(address_line1, '7-7-7'),
  address_line2 = COALESCE(address_line2, '七星館'),
  postal_code = COALESCE(postal_code, '777-7777')
WHERE email = 'premium@example.com';
