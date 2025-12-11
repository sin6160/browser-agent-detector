# AIエージェント検知 総合レポート（2025年11月版）

作成日：2025-11-03

---

## 概要

本レポートは、**TLSフィンガープリント（JA3/JA4）・HTTPヘッダー署名・WebRTC・Canvas描画差分・行動時系列シグナル**を統合し、ChatGPT・Claude・PerplexityなどのAIエージェント検知精度を高める実践的指針をまとめたものです。
また、OSSと独自実装をどのように組み合わせると効率的かについても併せて解説します。

---

## 第1章：フィンガープリント統合活用（JA4解説付き）

### 1. なぜ“組み合わせ”が効くのか

単独のTLS指紋では、CDN終端共有やuTLS偽装、TLS1.3/ECHの普及により識別力が低下します。
HTTP Message Signaturesなどの**検証可能な強シグナル**や、リクエスト間相関・レート・時間的ゆらぎなどの**行動時系列情報**を組み合わせることで、再識別精度を飛躍的に向上できます。

**参考実例**

* Cloudflare JA4+（TLS/HTTP/QUIC統合指紋）
* Akamai：TLS＋行動特徴による検知強化
* Fingerprint（Smart Signals）：デバイス＋行動統合でAI検知強化
* Simon WillisonによるChatGPTエージェント署名検証

---

### 2. JA4とは何か（JA3からの進化点）

JA4はJA3を拡張し、**TLS1.3・QUIC/HTTP3・SSH**など複数プロトコルを横断して扱えるスイート形式の指紋技術です。暗号化環境下でも通信実装の“地金”を識別可能にします。

**特徴**

* TLS1.3以降に最適化された構造
* HTTP/QUIC/SSH対応（JA4+）
* 不変部と可変部を分離し機械学習入力に適する形式
* CDNやuTLS偽装に強い

**参考**

* [JA4 GitHub（F5 Labs）](https://github.com/F5Labs/JA4)
* [Cloudflare JA4 Signals 解説](https://blog.cloudflare.com/ja4-signals/)

---

### 3. 各シグナルの層と強み・限界

| 層 / 技術                 | 強み                              | 限界・注意                                |
| ---------------------- | ------------------------------- | ------------------------------------ |
| TLSフィンガープリント (JA4/JA3) | UA偽装に強く、curl/Requests等の実装差を識別可能 | CDN共有やuTLS偽装で精度低下。TLS1.3/ECHにより観測困難化 |
| HTTPヘッダー（署名含む）         | HTTP Message Signaturesによる確証性   | 署名未対応では偽装容易。標準化進展依存                  |
| WebRTC (ICE/Stats)     | 実行環境依存の癖を反映                     | mDNSや制限により単独強度低下                     |
| Canvas描画差分             | ブラウザ描画癖を利用                      | ランダマイズで破綻可能。誤同定注意                    |
| 行動時系列                  | 人間らしさを反映し偽装耐性が高い                | コストとプライバシー配慮が必要                      |

---

### 4. 推奨設計（優先度付き）

1. **HTTP署名の検証（最優先）**

   * ChatGPTエージェントなどの`Signature-Agent`＋HTTP Message Signaturesを検証。
2. **TLS指紋＋HTTP整合性チェック**

   * JA4値とUA宣言の齟齬を強シグナルとして扱う。
3. **行動時系列解析**

   * レート・DOM操作・時間的ゆらぎで人間らしさを検証。
4. **WebRTC / Canvas補助スコア**

   * ランダマイズやブロック痕跡も別シグナル化。
5. **誤検知対策**

   * 多段しきい値（soft→hard deny）＋CAPTCHA/端末証明フォールバック。

---

### 5. 行動時系列の詳細と実装メモ

#### 観測項目例

* リクエスト間隔・バースト性・時間帯整合性
* ページ遷移の分散と再訪頻度
* DOM操作・スクロール慣性・キー入力ケイデンス
* Paste比率・リトライ間隔・セッション持続性

#### 特徴量例

* IAT分布の対数正規フィット誤差、CV²
* スクロール距離の自己相関
* 入力イベントエントロピー
* 昼夜レート差分（人間リズム指数）

#### 実装メモ

* Privacy by Designを徹底。PII非収集
* 疑義セッションを重点サンプリング
* 軽量ルール判定＋オフラインML再学習
* しきい値はABテストで最適化

---

### 6. まとめと参考リンク

JA4は強力だが単独では限界あり。HTTP署名や行動シグナルを統合し、段階的判定と誤検知制御で精度を高めることが推奨されます。

**参考URL（抜粋）**

* [Cloudflare JA4+ Signals](https://blog.cloudflare.com/ja4-signals/)
* [Akamai Bot Detection](https://www.akamai.com/blog/security/bots-tampering-with-tls-to-avoid-detection)
* [F5 JA4 Detection](https://community.f5.com/kb/technicalarticles/f5-distributed-cloud-ja4-detection-for-enhanced-performance-and-detection/338838)

---

## 第2章：OSSと独自実装の使い分け【実務ガイド】

### 1. ステップ別使い分け表

| ステップ         | OSSが有利                            | 独自実装が有利                 |
| ------------ | --------------------------------- | ----------------------- |
| HTTP署名検証     | `http-message-signatures`＋NGINX連携 | 単一形式なら数十行バリデータで十分       |
| TLSフィンガープリント | Zeek / Suricata＋JA4               | 小規模補助計測を自作可             |
| 行動時系列記録      | rrweb / OpenReplay＋Snowplow       | スコアリングは自作SQL/Pythonが柔軟  |
| WebRTC収集     | adapter.js / ObserveRTC           | 特徴量化・スコアは自作             |
| Canvas指紋     | FingerprintJS / ClientJS          | “取得不能＝対策痕跡”加点など独自ルール    |
| ログ収集         | Vector / Fluent Bit               | 小規模なら直接DB投げ             |
| DWH / 検索     | ClickHouse / OpenSearch           | 小規模PoCならPostgreSQL単体運用  |
| ダッシュボード      | Grafana / Metabase                | KPI少数なら自社UI＋Chart.js直描画 |
| スコアリング       | SQL/Pythonで十分                     | 軽量ML拡張（XGBoost等）推奨      |

---

### 2. 実務の“ラクさ”基準

* OSS向き：**重い領域（ネットワーク解析・行動記録・収集配管）**
* 独自実装向き：**判断ロジック・例外処理・署名検証・社内導線**
* 軽量PoCではPostgreSQLで開始し、成長に応じてClickHouse移行。

---

### 3. 最短PoC構成（OSS×独自）

* **Zeek**（JA4ログ収集） → **ClickHouse**格納
* **rrweb**（行動記録） → **PostgreSQL**直投げ
* **FastAPI/Express**製HTTP署名バリデータ（50〜100行）
* **Metabase**で疑義可視化
* **Pythonスコアリング**（IAT・Paste比率・UA×JA4齟齬など）

> 成功した部分から段階的に堅牢化：
> PostgreSQL → ClickHouse／独自 → 共通ライブラリ化／手動SQL → DBTスケジューラ化

---

### 4. 判断の指針チェックリスト

* 仕様変更頻度が高い？ → OSSで“面”を押さえる
* 社内例外が多い？ → 判定は独自実装
* データ量が少ない？ → PostgreSQLで開始
* プロダクトごとに差がある？ → 記録は共通SDK、スコアは個別ロジック

---

### 5. 結論まとめ

重労働はOSSで、意思決定は独自で。
最小構成（Zeek＋rrweb＋軽量バリデータ＋Metabase）で開始し、成果箇所を順次強化していくことが最も安全かつ効率的な導入パターンです。

---

## 付録：主要リンク集

* [Cloudflare JA4 Signals](https://blog.cloudflare.com/ja4-signals/)
* [Akamai Behavioral DDoS Engine](https://www.akamai.com/blog/security/akamais-behavioral-ddos-engine-breakthrough-in-modern-ddos-mitigation)
* [F5 BIG-IP JA4 適用事例](https://community.f5.com/kb/technicalarticles/fingerprinting-tls-clients-with-ja4-on-f5-big-ip/326298)
* [Fingerprint Smart Signals](https://www.businesswire.com/news/home/20250715112562/en/Fingerprint-Tackles-the-Rise-of-Agentic-AI-With-New-Signals)
