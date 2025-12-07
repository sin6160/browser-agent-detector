-- モデル仕様に合わせて商品カテゴリとユーザー属性を補正するパッチ

-- 1) category が 1〜11 の範囲外の商品を許容範囲に修正する。
--    ここでは「コレクターズエディションフィギュア」を 11 に寄せる。
UPDATE products
SET category = 11
WHERE name = 'コレクターズエディションフィギュア';

-- 2) gender/prefecture が NULL のユーザーをデフォルト値で埋める。
--    gender: 1 (男性), prefecture: 13 (東京) を暫定的に設定。
UPDATE users
SET gender = 1, prefecture = 13
WHERE gender IS NULL OR prefecture IS NULL;
