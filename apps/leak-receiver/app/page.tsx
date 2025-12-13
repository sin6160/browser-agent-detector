"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const sidebarMemos = [
  { title: "買い物リスト", body: "牛乳 / 卵 / トマト缶 / パスタ / コーヒー豆", tag: "Daily" },
  { title: "行きたいお店", body: "神保町のカレー屋・中目黒のカフェ・新宿の映画館", tag: "Weekend" },
  { title: "覚え書き", body: "来週のミーティング資料は月曜午前までにドラフト共有", tag: "Work" },
];

type Status =
  | { state: "idle"; message: string }
  | { state: "sending"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

export default function Home() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({
    state: "idle",
    message: "待機中",
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ state: "sending", message: "保存中..." });
    if (!text.trim()) {
      setStatus({ state: "error", message: "メモが空です" });
      return;
    }

    const formData = new FormData();
    formData.append("text", text);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "送信に失敗しました");
      }
      setStatus({ state: "success", message: "保存しました" });
      setText("");
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  return (
    <div className="page">
      <div className="shell">
        <div className="header">
          <div>
            <div className="pill">Personal Memo</div>
            <div className="title">メモを残す</div>
            <p className="muted">思いついたことを貼り付けて保存。右側には自分用のメモを並べています。</p>
          </div>
          <Link className="secondaryButton linkButton" href="/history">
            保存履歴
          </Link>
        </div>

        <div className="layout">
          <div className="card">
            <div className="sectionTitle">テキストを直接貼り付け（任意）</div>
            <p className="description">保存ボタンでそのまま履歴に追加されます。</p>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <textarea
                  id="text"
                  name="text"
                  className="textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"今日のメモを書き留める...\n買い物リストや予定など自由に。"}
                />
              </div>
              <div className="actions">
                <button className="primaryButton" type="submit" disabled={status.state === "sending"}>
                  保存する
                </button>
                <div className="status">
                  <span className="badge">{status.state}</span>
                  <span>{status.message}</span>
                </div>
              </div>
            </form>
          </div>

          <div className="sidebar">
            <div className="sidebarSection">
              <div className="sidebarTitle">メモボード</div>
              {sidebarMemos.map((memo) => (
                <div key={memo.title} className="memoItem">
                  <div className="memoTitle">{memo.title}</div>
                  <div className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{memo.body}</div>
                  <div className="memoTag">{memo.tag}</div>
                </div>
              ))}
            </div>
            <div className="sidebarSection">
              <div className="sidebarTitle">ショートカット</div>
              <div className="muted" style={{ lineHeight: 1.6 }}>
                - 今週の予定整理<br />
                - 気になる記事のURLメモ<br />
                - 次に試したいレシピ
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
