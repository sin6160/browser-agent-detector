-- 画像パスを実ファイル名（日本語ファイル名）に合わせる
UPDATE products SET image_path = '/images/スマートフォン X.jpeg' WHERE name = 'スマートフォン X';
UPDATE products SET image_path = '/images/ノートパソコン Pro.jpeg' WHERE name = 'ノートパソコン Pro';

-- スニーカー系は日本語ファイル名に統一
UPDATE products SET image_path = '/images/限定品スニーカー.png' WHERE name IN ('限定デザインスニーカー', '限定品スニーカー');

-- フィギュアは汎用パターン画像を設定
UPDATE products SET image_path = '/images/pattern.png' WHERE name = 'コレクターズエディションフィギュア';

UPDATE products SET image_path = '/images/ちゃぶ台.png' WHERE name = 'ちゃぶ台';
UPDATE products SET image_path = '/images/洋服.png' WHERE name = 'カジュアル洋服セット';
UPDATE products SET image_path = '/images/ペットの餌.png' WHERE name = 'プレミアムペットフード';
UPDATE products SET image_path = '/images/口紅.png' WHERE name = '高級口紅';
UPDATE products SET image_path = '/images/お菓子.png' WHERE name = '手作りお菓子セット';
UPDATE products SET image_path = '/images/洗濯機.png' WHERE name = '省エネ洗濯機';
UPDATE products SET image_path = '/images/歴史の本.png' WHERE name = '日本史の本';
