"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CalendarWeek, Meeting, Profile, Template } from "@/lib/types";
import { applyTemplate, deleteMeeting, lockMeeting, unlockMeeting, updateMeeting } from "@/app/actions";
import { fmtDate, fmtTime, fmtWeekday } from "@/lib/format";
import { SCHOOL_NAME, TEAM_NAME } from "@/lib/constants";

export default function MeetingHeader({
  meeting, members, calendar, leader, templates,
}: { meeting: Meeting; members: Profile[]; calendar: CalendarWeek[]; leader: boolean; templates: Template[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    meeting_date: meeting.meeting_date ?? "",
    meeting_time: (meeting.meeting_time ?? "14:00").slice(0, 5),
    place: meeting.place ?? "",
    secretary_id: meeting.secretary_id ?? "",
    attendance_note: meeting.attendance_note ?? "",
    topic: meeting.topic ?? "",
  });
  const locked = meeting.status === "locked";
  const secretary = members.find((m) => m.id === meeting.secretary_id);
  const notes = calendar.filter((c) => meeting.week_from != null && meeting.week_to != null && c.week_no >= meeting.week_from && c.week_no <= meeting.week_to && c.note);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Có lỗi.");
      else { setMsg(""); after?.(); router.refresh(); }
    });

  return (
    <div className="card mt-2 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-gray-500">{SCHOOL_NAME} · {TEAM_NAME}</p>
          <h1 className="text-xl font-semibold">{meeting.title}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {meeting.meeting_date ? `${fmtWeekday(meeting.meeting_date)}, ${fmtDate(meeting.meeting_date)}` : "Chưa định ngày"}
            {meeting.meeting_time ? `, ${fmtTime(meeting.meeting_time)}` : ""}
            {meeting.place ? ` · ${meeting.place}` : ""}
          </p>
          {meeting.topic && <p className="text-sm text-gray-600">Nội dung chính: {meeting.topic}</p>}
          <p className="text-sm text-gray-600">
            Thư kí: {secretary?.full_name || secretary?.email || "chưa phân công"}
            {meeting.attendance_note ? ` · ${meeting.attendance_note}` : ""}
          </p>
          {notes.map((n) => (
            <p key={n.week_no} className="mt-1 text-xs text-amber-800">Tuần {n.week_no}: {n.note}</p>
          ))}
        </div>
        <span className={`badge ${locked ? "badge-locked" : "badge-open"}`}>{locked ? "Đã khóa" : "Đang mở"}</span>
      </div>

      {leader && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          {!locked && <button className="btn btn-sm" onClick={() => setEdit(!edit)}>Sửa thông tin buổi họp</button>}
          {!locked ? (
            <button className="btn btn-sm" disabled={pending} onClick={() => confirm("Khóa biên bản? Sau khi khóa không ai sửa được nội dung.") && run(() => lockMeeting(meeting.id))}>Khóa biên bản</button>
          ) : (
            <button className="btn btn-sm" disabled={pending} onClick={() => confirm("Mở khóa biên bản này? Việc mở khóa được ghi lại.") && run(() => unlockMeeting(meeting.id))}>Mở khóa</button>
          )}
          {!locked && templates.length > 0 && (
            <select className="input !w-auto !py-1 text-sm" defaultValue="" disabled={pending}
              onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) run(() => applyTemplate(meeting.id, v)); }}>
              <option value="">+ Thêm bộ đề mục…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            <a className="btn btn-sm" href={`/api/export/${meeting.id}?format=docx`}>Tải Word</a>
            <a className="btn btn-sm" href={`/api/export/${meeting.id}?format=html`}>Tải HTML</a>
            <a className="btn btn-sm" href={`/api/export/${meeting.id}?format=pdf`} target="_blank">In / PDF</a>
            <a className="btn btn-sm" href={`/api/export/${meeting.id}?format=zip`}>Tải trọn gói (có minh chứng)</a>
          </span>
          {!locked && (
            <button className="btn btn-sm btn-danger" disabled={pending}
              onClick={() => confirm("Xóa hẳn biên bản này cùng mọi nội dung?") && run(() => deleteMeeting(meeting.id))}>Xóa</button>
          )}
        </div>
      )}

      {edit && leader && (
        <div className="mt-3 grid gap-3 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
          <label className="text-sm">Ngày họp<input type="date" className="input mt-1" value={f.meeting_date} onChange={(e) => setF({ ...f, meeting_date: e.target.value })} /></label>
          <label className="text-sm">Giờ họp<input type="time" className="input mt-1" value={f.meeting_time} onChange={(e) => setF({ ...f, meeting_time: e.target.value })} /></label>
          <label className="text-sm">Địa điểm<input className="input mt-1" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></label>
          <label className="text-sm">Thư kí
            <select className="input mt-1" value={f.secretary_id} onChange={(e) => setF({ ...f, secretary_id: e.target.value })}>
              <option value="">Chưa phân công</option>
              {members.filter((m) => m.role === "giao_vien" || m.role === "to_truong").map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">Nội dung chính của buổi họp<input className="input mt-1" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
          <label className="text-sm sm:col-span-2">Ghi chú thành phần dự họp (vắng, có phép…)<input className="input mt-1" value={f.attendance_note} onChange={(e) => setF({ ...f, attendance_note: e.target.value })} /></label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary btn-sm" disabled={pending}
              onClick={() => run(() => updateMeeting(meeting.id, {
                meeting_date: f.meeting_date || null, meeting_time: f.meeting_time || null, place: f.place || null,
                secretary_id: f.secretary_id || null, attendance_note: f.attendance_note || null, topic: f.topic || null,
              }), () => setEdit(false))}>Lưu</button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
