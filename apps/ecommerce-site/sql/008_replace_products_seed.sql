-- 関連FKを先にクリア
DELETE FROM order_items;
DELETE FROM cart_items;
DELETE FROM sqlite_sequence WHERE name IN ('order_items', 'cart_items');

DELETE FROM products;
DELETE FROM sqlite_sequence WHERE name = 'products';

INSERT INTO products (name, category, brand, price, stock_quantity, is_limited, image_path, description) VALUES
  ('スマートフォン X', 1, 2, 89800, 50, 0, '/images/smartphone.jpg', '最新のスマートフォン'),
  ('ノートパソコン Pro', 1, 2, 158000, 30, 0, '/images/laptop.jpg', 'プロフェッショナル向けノートパソコン'),
  ('ワイヤレスイヤホン', 12, 3, 22800, 100, 0, '/images/wireless-earbuds.jpeg', '高音質ワイヤレスイヤホン'),
  ('スマートウォッチ', 12, 4, 32800, 80, 0, '/images/smartwatch.jpeg', '健康管理機能付きスマートウォッチ'),
  ('Bluetoothスピーカー', 12, 3, 12800, 15, 1, '/images/bluetooth-speaker.jpeg', '高音質Bluetoothスピーカー'),
  ('ポータブルSSD 1TB', 1, 5, 18000, 20, 1, '/images/portable-ssd-1tb.jpeg', '大容量・高速ポータブルSSD'),
  ('4Kテレビ 55インチ', 2, 6, 128000, 8, 1, '/images/4k-tv-55.jpeg', '高精細4Kスマートテレビ'),
  ('ゲーミングマウス', 10, 7, 9800, 30, 1, '/images/gaming-mouse.jpeg', '高精度ゲーミングマウス'),
  ('メカニカルキーボード', 10, 8, 15800, 25, 1, '/images/mechanical-keyboard.jpeg', '高性能メカニカルキーボード'),
  ('デジタルカメラ', 12, 9, 68000, 12, 1, '/images/digital-camera.jpeg', '高画質ミラーレスカメラ'),
  ('アマギフ 1,000円', 11, 1, 1000, 999, 0, '/images/gift_card_sample.png', 'アマゾンギフト券 1,000円分'),
  ('アマギフ 10,000円', 11, 1, 10000, 999, 0, '/images/gift_card_sample.png', 'アマゾンギフト券 10,000円分'),
  ('ちゃぶ台', 9, 10, 25000, 15, 0, '/images/chabudai.png', '伝統的な日本のちゃぶ台。家族団らんに最適です。'),
  ('カジュアル洋服セット', 7, 11, 8500, 25, 0, '/images/clothes.png', '日常使いにぴったりのカジュアルな洋服セット。'),
  ('プレミアムペットフード', 6, 12, 3200, 40, 0, '/images/petfood.png', '愛犬・愛猫の健康を考えたプレミアムフード。'),
  ('高級口紅', 8, 13, 4500, 20, 0, '/images/lipstick.png', '長時間持続する高級口紅。豊富なカラーバリエーション。'),
  ('手作りお菓子セット', 4, 14, 1800, 30, 0, '/images/sweets.png', '職人が手作りした美味しいお菓子の詰め合わせ。'),
  ('省エネ洗濯機', 2, 15, 85000, 8, 0, '/images/washer.png', '最新の省エネ技術を搭載した高性能洗濯機。'),
  ('日本史の本', 3, 16, 2200, 35, 0, '/images/historybook.png', '日本の歴史を詳しく解説した学習書。'),
  ('限定品スニーカー', 7, 19, 25800, 5, 1, '/images/sneaker.png', '数量限定のプレミアムスニーカー。希少なデザインと高品質な素材を使用。');
