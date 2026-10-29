"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMeeting, lockMeeting, unlockMeeting } from "@/app/actions";

export default function ExportBar({ meetingId, locked }: { meetingId: string; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<number | null>(null); // dấu thời gian để tải lại bản xem trước
  return (
    <div className="card mt-6 p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-accent btn-lg" onClick={() => setView(view === null ? Date.now() : null)}>
          {view === null ? "👁 Xem trước nội dung biên bản" : "Đóng xem trước"}
        </button>
        {view !== null && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => setView(Date.now())}>Tải lại</button>
            <a className="btn btn-sm" href={`/api/export/${meetingId}?format=preview`} target="_blank">Mở cửa sổ riêng</a>
          </>
        )}
      </div>
      {view !== null && (
        <>
          <p className="mt-2 text-xs text-gray-500">Đây là bản đúng bố cục sẽ xuất ra Word. Chỉ gồm nội dung đã nhận, các khung tím chưa nhận sẽ chưa hiện.</p>
          <iframe key={view} title="Xem trước biên bản" src={`/api/export/${meetingId}?format=preview&t=${view}`}
            className="mt-2 h-[78vh] w-full rounded-xl border border-[var(--line)] bg-white" />
        </>
      )}
      <p className="mt-4 text-sm font-semibold text-gray-700">Xuất biên bản</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=docx`}>Tải Word</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=html`}>Tải HTML</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=pdf`} target="_blank">In / PDF</a>
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
