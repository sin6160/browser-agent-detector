-- Cloudflare Pages での非ASCIIファイル名配信トラブルを回避するため、ASCII名の画像に切り替える
UPDATE products SET image_path = '/images/smartphone.jpg' WHERE name = 'スマートフォン X';
UPDATE products SET image_path = '/images/laptop.jpg' WHERE name = 'ノートパソコン Pro';
UPDATE products SET image_path = '/images/sneaker.png' WHERE name IN ('限定デザインスニーカー', '限定品スニーカー');
UPDATE products SET image_path = '/images/figure.jpg' WHERE name = 'コレクターズエディションフィギュア';
UPDATE products SET image_path = '/images/chabudai.png' WHERE name = 'ちゃぶ台';
UPDATE products SET image_path = '/images/clothes.png' WHERE name = 'カジュアル洋服セット';
UPDATE products SET image_path = '/images/petfood.png' WHERE name = 'プレミアムペットフード';
UPDATE products SET image_path = '/images/lipstick.png' WHERE name = '高級口紅';
UPDATE products SET image_path = '/images/sweets.png' WHERE name = '手作りお菓子セット';
UPDATE products SET image_path = '/images/washer.png' WHERE name = '省エネ洗濯機';
UPDATE products SET image_path = '/images/historybook.png' WHERE name = '日本史の本';
