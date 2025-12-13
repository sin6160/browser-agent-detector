"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

type Status =
  | { state: "idle"; message: string }
  | { state: "sending"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const initialForm = {
  name: "",
  address: "",
  phone: "",
  job: "",
  age: "",
  creditCard: "",
  text: "",
};

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<Status>({
    state: "idle",
    message: "待機中",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ state: "sending", message: "送信中..." });

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("address", form.address);
    formData.append("phone", form.phone);
    formData.append("job", form.job);
    formData.append("age", form.age);
    formData.append("credit_card", form.creditCard);
    formData.append("text", form.text);

    if (fileInputRef.current?.files?.[0]) {
      formData.append("file", fileInputRef.current.files[0]);
    }

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "送信に失敗しました");
      }
      setStatus({ state: "success", message: "受信エンドポイントへ送信しました" });
      setForm(initialForm);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
            <div className="pill">デモ用受信エンドポイント</div>
            <div className="title">アカウント情報送信フォーム</div>
            <p className="muted">
              氏名・住所・電話・職業・年齢・クレジットカード番号（任意）を送信できます。テキストファイルを選ぶか、下のテキスト欄に直接貼り付けてください。
            </p>
          </div>
          <Link className="secondaryButton linkButton" href="/history">
            入力履歴を見る
          </Link>
        </div>

        <div className="card">
          <div className="sectionTitle">直接入力</div>
          <p className="description">
            ここで入力した値は優先して保存されます。テキストファイルに含まれる値がある場合は、自動パースした上で上書きします。
          </p>
          <form onSubmit={handleSubmit}>
            <div className="formGrid">
              <div className="field">
                <label className="label" htmlFor="name">
                  氏名
                </label>
                <input
                  id="name"
                  name="name"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="山田 太郎"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="address">
                  住所
                </label>
                <input
                  id="address"
                  name="address"
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="東京都千代田区1-2-3"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="phone">
                  電話番号
                </label>
                <input
                  id="phone"
                  name="phone"
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="03-1234-5678"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="job">
                  職業
                </label>
                <input
                  id="job"
                  name="job"
                  className="input"
                  value={form.job}
                  onChange={(e) => setForm({ ...form, job: e.target.value })}
                  placeholder="会社員"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="age">
                  年齢
                </label>
                <input
                  id="age"
                  name="age"
                  className="input"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  placeholder="36"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="credit_card">
                  クレジットカード番号（任意）
                </label>
                <input
                  id="credit_card"
                  name="credit_card"
                  className="input"
                  value={form.creditCard}
                  onChange={(e) => setForm({ ...form, creditCard: e.target.value })}
                  placeholder="****-****-****-****"
                />
              </div>
            </div>

            <div style={{ height: 16 }} />

            <div className="field">
              <label className="label" htmlFor="file">
                テキストファイル（任意）
              </label>
              <input ref={fileInputRef} id="file" name="file" type="file" accept=".txt,.text" className="fileInput" />
              <p className="muted">ファイル内は「氏名: 山田太郎」のような形式だと自動で項目に割り当てます。</p>
            </div>

            <div style={{ height: 12 }} />

            <div className="field">
              <label className="label" htmlFor="text">
                テキストを直接貼り付け（任意）
              </label>
              <textarea
                id="text"
                name="text"
                className="textarea"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder={"氏名: 山田太郎\n住所: 東京都...\n電話: 03-1234-5678"}
              />
            </div>

            <div className="actions">
              <button className="primaryButton" type="submit" disabled={status.state === "sending"}>
                送信する
              </button>
              <Link className="secondaryButton linkButton" href="/history">
                受信履歴を見る
              </Link>
              <div className="status">
                <span className="badge">{status.state}</span>
                <span>{status.message}</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
