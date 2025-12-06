-- 追加シード: homemaker@example.com（UIに表示されるテストユーザーと揃える）
INSERT OR IGNORE INTO users (email, password_hash, age, occupation, member_rank)
VALUES ('homemaker@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 38, 'homemaker', 'silver');

