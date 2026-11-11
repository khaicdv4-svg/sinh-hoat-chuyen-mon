"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMeeting, lockMeeting, unlockMeeting } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";

export default function ExportBar({ meetingId, locked, finalizedAt, models, defaultModelId, missingOpinions = [] }: {
  meetingId: string; locked: boolean; finalizedAt: string | null; missingOpinions?: { part: string; n: number }[]; models: { id: string; label: string }[] | null; defaultModelId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<number | null>(null); // dấu thời gian để tải lại bản xem trước
  const [busy, setBusy] = useState<"" | "final" | "undo">("");
  const [result, setResult] = useState<{ sections: number; blanks: string[] } | null>(null);

  async function finalize(undo = false) {
    if (!undo && !confirm("AI sẽ rà soát toàn bộ biên bản: gộp các đề xuất, bỏ ghi chú thiếu thông tin và chỗ chấm trống, viết lại câu chữ cho hoàn chỉnh. Nội dung cũ được giữ để hoàn tác. Tiếp tục?")) return;
    if (undo && !confirm("Trả lại nội dung trước khi hoàn chỉnh? Bản hoàn chỉnh sẽ chuyển thành khung tím để thầy xem.")) return;
    setBusy(undo ? "undo" : "final"); setMsg(""); setResult(null);
    try {
      const res = await fetch("/api/ai/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, modelId: defaultModelId, undo }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa hoàn chỉnh được.");
      if (!undo) setResult({ sections: j.sections, blanks: j.blanks ?? [] });
      setView(Date.now());
      router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }
  return (
    <div className="card mt-6 p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-accent btn-lg" onClick={() => setView(view === null ? Date.now() : null)}>
          {view === null ? "👁 Xem trước nội dung biên bản" : "Đóng xem trước"}
        </button>
        {!locked && models && (
          <button type="button" className="btn btn-primary btn-lg" disabled={!!busy} onClick={() => finalize(false)}>
            {busy === "final" ? "AI đang hoàn chỉnh (1–2 phút)…" : "✨ Hoàn chỉnh biên bản"}
          </button>
        )}
        {view !== null && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => setView(Date.now())}>Tải lại</button>
            <a className="btn btn-sm" href={`/api/export/${meetingId}?format=preview`} target="_blank">Mở cửa sổ riêng</a>
          </>
        )}
      </div>
      {!locked && missingOpinions.length > 0 && (
        <p className="mt-2 text-sm text-amber-900">
          Còn thành viên chưa gửi ý kiến: {missingOpinions.map((x) => `mục ${x.part} (${x.n} người)`).join(", ")}. Thầy kéo lên khung ý kiến cuối mỗi mục, bấm “🤖 AI viết ý kiến thay thành viên chưa gửi” trước khi hoàn chỉnh và xuất.
        </p>
      )}
      {finalizedAt && (
        <p className="mt-2 text-sm text-green-800">
          Đã hoàn chỉnh lúc {fmtDateTime(finalizedAt)}. Bản xuất không còn ghi chú đỏ và chỗ chấm trống.
          {!locked && models && (
            <button type="button" className="ml-2 underline" disabled={!!busy} onClick={() => finalize(true)}>
              {busy === "undo" ? "Đang hoàn tác…" : "Hoàn tác"}
            </button>
          )}
        </p>
      )}
      {result && (
        <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <p>AI đã hoàn chỉnh {result.sections} mục. Thầy đọc lại bản xem trước bên dưới trước khi xuất.</p>
          {result.blanks.length > 0 && (
            <p className="mt-1 text-amber-900">Thông tin buổi họp còn trống nên bản in lược bỏ: {result.blanks.join("; ")}. Thầy điền ở phần thông tin buổi họp nếu muốn ghi rõ.</p>
          )}
        </div>
      )}
      {view !== null && (
        <>
          <p className="mt-2 text-xs text-gray-500">
            Đây là bản đúng bố cục sẽ xuất ra Word. Chỉ gồm nội dung đã nhận, các khung tím chưa nhận sẽ chưa hiện.
            {!finalizedAt && " Chữ đỏ là chỗ còn thiếu, bấm “Hoàn chỉnh biên bản” để AI xử lý."}
          </p>
          <iframe key={view} title="Xem trước biên bản" src={`/api/export/${meetingId}?format=preview&t=${view}`}
            className="mt-2 h-[78vh] w-full rounded-xl border border-[var(--line)] bg-white" />
        </>
      )}
      <p className="mt-4 text-sm font-semibold text-gray-700">Xuất và in biên bản</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=docx`}>Xuất Word</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=html`}>Tải HTML</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=pdf`} target="_blank">Xuất PDF / In</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=zip`}>Tải trọn gói (có minh chứng)</a>
        {!locked ? (
          <button className="btn btn-sm" disabled={pending}
            onClick={() => confirm("Khóa biên bản? Sau khi khóa không ai sửa được nội dung.") && start(async () => { const r = await lockMeeting(meetingId); if (r && !r.ok) setMsg(r.error ?? "Có lỗi."); else router.refresh(); })}>
            Khóa biên bản
          </button>
        ) : (
          <button className="btn btn-sm" disabled={pending}
            onClick={() => confirm("Mở khóa biên bản này? Việc mở khóa được ghi lại.") && start(async () => { const r = await unlockMeeting(meetingId); if (r && !r.ok) setMsg(r.error ?? "Có lỗi."); else router.refresh(); })}>
            Mở khóa
          </button>
        )}
        {!locked && (
          <button className="btn btn-sm btn-danger sm:ml-auto" disabled={pending}
            onClick={() => confirm("Xóa hẳn biên bản này cùng mọi nội dung?") && start(async () => { const r = await deleteMeeting(meetingId); if (r && !r.ok) setMsg(r.error ?? "Có lỗi."); })}>
            Xóa biên bản
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
