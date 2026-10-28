"use client";
import { useState, useTransition } from "react";
import { deleteMeeting } from "@/app/actions";

export default function ExportBar({ meetingId, locked }: { meetingId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="card mt-6 p-4 print:hidden">
      <p className="text-sm font-semibold text-gray-700">Xuất biên bản</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=docx`}>Tải Word</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=html`}>Tải HTML</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=pdf`} target="_blank">In / PDF</a>
        <a className="btn btn-sm" href={`/api/export/${meetingId}?format=zip`}>Tải trọn gói (có minh chứng)</a>
        {!locked && (
          <button className="btn btn-sm btn-danger ml-auto" disabled={pending}
            onClick={() => confirm("Xóa hẳn biên bản này cùng mọi nội dung?") && start(async () => { const r = await deleteMeeting(meetingId); if (r && !r.ok) setMsg(r.error); })}>
            Xóa biên bản
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
