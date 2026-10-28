"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Model = { id: string; label: string };

const QUICK = [
  { t: "Viết cả biên bản", q: "Viết đầy đủ các mục còn trống của biên bản này, theo kế hoạch và văn bản của tổ trong thời điểm hiện tại." },
  { t: "Phần chương trình, nhiệm vụ", q: "Chỉ soạn phần chương trình và nhiệm vụ của buổi sinh hoạt này, lấy từ kế hoạch năm và lịch tuần." },
  { t: "Triển khai văn bản mới", q: "Soạn phần triển khai các văn bản mới đang có trong nguồn tư liệu, nêu việc tổ cần làm." },
  { t: "Dự thảo kết luận", q: "Soạn dự thảo phần kết luận dựa trên những nội dung đã ghi trong biên bản." },
];

export default function AiAssistant({ meetingId, models, defaultModelId }: { meetingId: string; models: Model[]; defaultModelId: string }) {
  const router = useRouter();
  const [modelId, setModelId] = useState(defaultModelId);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"empty" | "all">("empty");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ sections: number; lines: number; missing: string[] } | null>(null);

  async function run() {
    setBusy(true); setErr(""); setDone(null);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, instruction: text, scope, modelId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa viết được.");
      setDone({ sections: j.sections, lines: j.lines, missing: j.missing ?? [] });
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <section className="card mt-4 border-l-4 !border-l-[var(--brand)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">🤖 Trợ lý AI viết biên bản</h2>
        <span className="badge badge-ai">Chỉ tổ trưởng</span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Mô hình AI
          <select className="input !w-auto !py-1" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={busy}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        AI biết hôm nay là ngày nào, buổi họp đã diễn ra hay chưa, rồi đọc kế hoạch, văn bản, lịch trong Nguồn tư liệu để soạn. Mỗi ý một dòng gạch đầu dòng, chưa có căn cứ thì không bịa. Kết quả nằm trong khung tím để thầy xem, sửa rồi mới nhận.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((c) => <button key={c.t} type="button" className="btn btn-sm" disabled={busy} onClick={() => setText(c.q)}>{c.t}</button>)}
      </div>
      <textarea className="input mt-3 min-h-24" disabled={busy} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Thầy dặn AI việc cần làm. Ví dụ: Viết phần đánh giá công tác chuyên môn 2 tuần vừa qua, nhấn mạnh việc kiểm tra giữa kì." />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select className="input !w-auto" value={scope} onChange={(e) => setScope(e.target.value as "empty" | "all")} disabled={busy}>
          <option value="empty">Chỉ các mục còn trống</option>
          <option value="all">Cả các mục đã có nội dung (chỉ bổ sung)</option>
        </select>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={run}>
          {busy ? "AI đang soạn (khoảng 1 phút)…" : "Viết biên bản"}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      {done && (
        <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <p>AI đã soạn {done.lines} dòng vào {done.sections} mục. Thầy xem các khung tím bên dưới, sửa nếu cần rồi bấm "Nhận tất cả".</p>
          {done.missing.length > 0 && (
            <div className="mt-2 text-amber-900">
              <p className="font-semibold">Còn thiếu thông tin, thầy bổ sung giúp:</p>
              <ul className="ml-5 list-disc">{done.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
