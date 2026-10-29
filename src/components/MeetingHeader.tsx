"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Attendance, CalendarWeek, Meeting, Member, Template } from "@/lib/types";
import {
  acceptAllProposals, applyTemplate, lockMeeting, saveAttendance, saveMinutes, unlockMeeting, updateMeeting,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtTime, fmtWeekday, memberName, safeFileName } from "@/lib/format";
import { BUCKET, SCHOOL_NAME, TEAM_NAME } from "@/lib/constants";

type R = { ok: boolean; error?: string };

export default function MeetingHeader({
  meeting, members, attendance, calendar, leader, secretary, templates, proposals, pendingOpinions, me,
}: {
  meeting: Meeting; members: Member[]; attendance: Attendance[]; calendar: CalendarWeek[];
  leader: boolean; secretary: boolean; templates: Template[]; proposals: number; pendingOpinions?: number; me: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [panel, setPanel] = useState<"" | "info" | "att" | "vote" | "import">("");
  const fileIn = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [picked, setPicked] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const locked = meeting.status === "locked";
  const active = members.filter((m) => m.active);
  const byId = (id: string | null) => members.find((m) => m.id === id) ?? null;
  const chair = byId(meeting.chair_member_id);
  const sec = byId(meeting.secretary_member_id);
  const absent = attendance.filter((a) => !a.present);
  const notes = calendar.filter((c) => meeting.week_from != null && meeting.week_to != null && c.week_no >= meeting.week_from && c.week_no <= meeting.week_to && c.note);

  const [f, setF] = useState({
    meeting_date: meeting.meeting_date ?? "",
    meeting_time: (meeting.meeting_time ?? "14:00").slice(0, 5),
    place: meeting.place ?? "",
    chair_member_id: meeting.chair_member_id ?? "",
    secretary_member_id: meeting.secretary_member_id ?? "",
    topic: meeting.topic ?? "",
    ncbh_stage: meeting.ncbh_stage ?? "",
  });
  const [att, setAtt] = useState(() =>
    Object.fromEntries(active.map((m) => {
      const a = attendance.find((x) => x.member_id === m.id);
      return [m.id, { present: a ? a.present : true, reason: a?.reason ?? "" }];
    })),
  );
  const [vote, setVote] = useState({
    end_time: (meeting.end_time ?? "").slice(0, 5),
    vote_agree: meeting.vote_agree?.toString() ?? "",
    vote_total: meeting.vote_total?.toString() ?? "",
    vote_other: meeting.vote_other ?? "",
  });

  const run = (fn: () => Promise<R>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Có lỗi.");
      else { setMsg(""); after?.(); router.refresh(); }
    });

  const canMinutes = !locked && (leader || secretary);
  const toggle = (p: typeof panel) => setPanel(panel === p ? "" : p);

  async function importFile() {
    const file = fileIn.current?.files?.[0];
    if (!file) return;
    setImporting(true); setMsg(""); setOk("");
    try {
      const supabase = createClient();
      const path = `leader/nhap_bien_ban/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const { data, error } = await supabase.from("shcm_files")
        .insert({ kind: "mau_bien_ban", meeting_id: meeting.id, storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, uploaded_by: me })
        .select("id").single();
      if (error) throw new Error(error.message);
      const res = await fetch("/api/ai/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: meeting.id, fileId: data.id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa đọc được tệp.");
      setOk(`AI đã đưa ${j.entries} đoạn vào ${j.sections} mục${j.newSections ? `, thêm ${j.newSections} mục mới` : ""}${j.skipped ? `, bỏ qua ${j.skipped} chỗ còn chấm chấm để trống` : ""}. Các đoạn đang ở dạng đề xuất (khung tím), thầy xem lại rồi bấm "Nhận tất cả".`);
      setPanel("");
      if (fileIn.current) fileIn.current.value = "";
      setPicked("");
      router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setImporting(false);
  }

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
          {meeting.format && (
            <p className="text-sm text-gray-600">
              Hình thức: <b>{meeting.format === "truc_tuyen" ? "Sinh hoạt trực tuyến" : "Sinh hoạt trực tiếp"}</b>
              {meeting.format === "truc_tuyen" && meeting.online_link && (
                <> · <a href={meeting.online_link} target="_blank" rel="noreferrer" className="font-semibold text-[var(--brand)] underline">Vào phòng họp{meeting.online_platform ? ` (${meeting.online_platform})` : ""}</a></>
              )}
            </p>
          )}
          <p className="text-sm text-gray-600">
            Chủ trì: {chair ? memberName(chair) : "chưa chọn"} · Thư ký: {sec ? memberName(sec) : "chưa phân công"}
          </p>
          <p className="text-sm text-gray-600">
            {attendance.length
              ? `Có mặt ${active.length - absent.length}/${active.length}` + (absent.length ? ` · Vắng: ${absent.map((a) => { const m = byId(a.member_id); return `${m ? memberName(m) : "?"}${a.reason ? ` (${a.reason})` : ""}`; }).join("; ")}` : "")
              : "Chưa điểm danh"}
          </p>
          {meeting.ncbh_stage && <p className="text-sm text-gray-600">Giai đoạn NCBH: {meeting.ncbh_stage}</p>}
          {meeting.topic && <p className="text-sm text-gray-600">Nội dung chính: {meeting.topic}</p>}
          {notes.map((n) => <p key={n.week_no} className="mt-1 text-xs text-amber-800">Tuần {n.week_no}: {n.note}</p>)}
        </div>
        <span className={`badge ${locked ? "badge-locked" : "badge-open"}`}>{locked ? "Đã khóa" : "Đang mở"}</span>
      </div>

      {(leader || canMinutes) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          {leader && !locked && <button className="btn btn-sm" onClick={() => toggle("info")}>Thông tin buổi họp</button>}
          {canMinutes && <button className="btn btn-sm" onClick={() => toggle("att")}>Điểm danh</button>}
          {canMinutes && <button className="btn btn-sm" onClick={() => toggle("vote")}>Biểu quyết, giờ kết thúc</button>}
          {leader && !locked && <button className="btn btn-sm btn-accent" onClick={() => toggle("import")}>📄 Nhập từ biên bản Word</button>}
          {leader && !locked && (pendingOpinions ?? 0) > 0 && (
            <span className="badge badge-ai">{pendingOpinions} ý kiến chờ xem</span>
          )}
          {leader && !locked && proposals > 0 && (
            <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => confirm(`Nhận cả ${proposals} đề xuất vào biên bản?`) && run(() => acceptAllProposals(meeting.id))}>
              Nhận tất cả {proposals} đề xuất
            </button>
          )}
          {leader && !locked && templates.length > 0 && (
            <select className="input !w-auto !py-1 text-sm" defaultValue="" disabled={pending}
              onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) run(() => applyTemplate(meeting.id, v)); }}>
              <option value="">+ Thêm bộ đề mục…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
      )}
      {panel === "info" && leader && (
        <div className="mt-3 grid gap-3 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
          <label className="text-sm">Ngày họp<input type="date" className="input mt-1" value={f.meeting_date} onChange={(e) => setF({ ...f, meeting_date: e.target.value })} /></label>
          <label className="text-sm">Giờ bắt đầu<input type="time" className="input mt-1" value={f.meeting_time} onChange={(e) => setF({ ...f, meeting_time: e.target.value })} /></label>
          <label className="text-sm sm:col-span-2">Địa điểm<input className="input mt-1" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></label>
          <label className="text-sm">Chủ trì
            <select className="input mt-1" value={f.chair_member_id} onChange={(e) => setF({ ...f, chair_member_id: e.target.value })}>
              <option value="">Chưa chọn</option>
              {active.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
            </select>
          </label>
          <label className="text-sm">Thư ký
            <select className="input mt-1" value={f.secretary_member_id} onChange={(e) => setF({ ...f, secretary_member_id: e.target.value })}>
              <option value="">Chưa phân công</option>
              {active.map((m) => <option key={m.id} value={m.id}>{memberName(m)}{m.user_id ? "" : " (chưa có tài khoản)"}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">Giai đoạn NCBH đang thực hiện (hiện giữa trang biên bản)
            <input className="input mt-1" placeholder="Ví dụ: BƯỚC 3 - PHÂN TÍCH BÀI HỌC; BƯỚC 4 - VẬN DỤNG KẾT QUẢ VÀO DẠY HỌC HẰNG NGÀY" value={f.ncbh_stage} onChange={(e) => setF({ ...f, ncbh_stage: e.target.value })} />
          </label>
          <label className="text-sm sm:col-span-2">Nội dung chính (chỉ hiện trong ứng dụng)<input className="input mt-1" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
          <p className="text-xs text-gray-500 sm:col-span-2">Thư ký có tài khoản sẽ được ghi ý kiến thay các thành viên, điểm danh và ghi biểu quyết trong buổi này.</p>
          <div className="sm:col-span-2">
            <button className="btn btn-primary btn-sm" disabled={pending}
              onClick={() => run(() => updateMeeting(meeting.id, {
                meeting_date: f.meeting_date || null, meeting_time: f.meeting_time || null, place: f.place || null,
                chair_member_id: f.chair_member_id || null, secretary_member_id: f.secretary_member_id || null,
                topic: f.topic || null, ncbh_stage: f.ncbh_stage.trim() || null,
              }), () => setPanel(""))}>Lưu</button>
          </div>
        </div>
      )}

      {panel === "att" && canMinutes && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <div className="grid gap-2">
            {active.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex min-w-56 items-center gap-2">
                  <input type="checkbox" checked={att[m.id]?.present ?? true} onChange={(e) => setAtt({ ...att, [m.id]: { ...att[m.id], present: e.target.checked } })} />
                  {memberName(m)}
                </label>
                {!att[m.id]?.present && (
                  <input className="input !w-64 !py-1" placeholder="Lí do vắng" value={att[m.id]?.reason ?? ""} onChange={(e) => setAtt({ ...att, [m.id]: { ...att[m.id], reason: e.target.value } })} />
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-sm mt-3" disabled={pending}
            onClick={() => run(() => saveAttendance(meeting.id, active.map((m) => ({ member_id: m.id, present: att[m.id]?.present ?? true, reason: att[m.id]?.reason || null }))), () => setPanel(""))}>
            Lưu điểm danh
          </button>
        </div>
      )}

      {panel === "vote" && canMinutes && (
        <div className="mt-3 grid gap-3 border-t border-[var(--line)] pt-3 sm:grid-cols-4">
          <label className="text-sm">Số nhất trí<input type="number" min={0} className="input mt-1" value={vote.vote_agree} onChange={(e) => setVote({ ...vote, vote_agree: e.target.value })} /></label>
          <label className="text-sm">Trên tổng số<input type="number" min={0} className="input mt-1" value={vote.vote_total} placeholder={String(active.length - absent.length)} onChange={(e) => setVote({ ...vote, vote_total: e.target.value })} /></label>
          <label className="text-sm">Giờ kết thúc<input type="time" className="input mt-1" value={vote.end_time} onChange={(e) => setVote({ ...vote, end_time: e.target.value })} /></label>
          <label className="text-sm sm:col-span-4">Ý kiến khác<input className="input mt-1" value={vote.vote_other} placeholder="Không" onChange={(e) => setVote({ ...vote, vote_other: e.target.value })} /></label>
          <div className="sm:col-span-4">
            <button className="btn btn-primary btn-sm" disabled={pending}
              onClick={() => run(() => saveMinutes(meeting.id, {
                end_time: vote.end_time || null,
                vote_agree: vote.vote_agree === "" ? null : Number(vote.vote_agree),
                vote_total: vote.vote_total === "" ? null : Number(vote.vote_total),
                vote_other: vote.vote_other,
              }), () => setPanel(""))}>Lưu</button>
          </div>
        </div>
      )}

      {panel === "import" && leader && (
        <div className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
          <p className="text-gray-600">
            Tải biên bản Word (.docx) hoặc PDF đã soạn sẵn. AI đọc rồi đưa từng đoạn vào đúng mục, ý kiến của ai gắn đúng tên người đó, mục nào chưa có thì thêm.
            Những chỗ còn chấm chấm để trống. Mọi đoạn ở dạng đề xuất, thầy duyệt rồi mới vào biên bản.
          </p>
          <div className="mt-3 flex flex-wrap items-stretch gap-3">
            <label className={`filepick ${dragOver ? "drag" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && fileIn.current) {
                  const dt = new DataTransfer(); dt.items.add(f);
                  fileIn.current.files = dt.files; setPicked(f.name);
                }
              }}>
              <span className="btn btn-accent btn-lg">📄 Chọn tệp biên bản</span>
              <span className="min-w-0 flex-1 break-words font-medium">
                {picked || "Chưa chọn tệp. Bấm vào đây hoặc kéo tệp .docx, .pdf thả vào."}
              </span>
              <input ref={fileIn} type="file" accept=".docx,.pdf" className="sr-only"
                onChange={(e) => setPicked(e.target.files?.[0]?.name ?? "")} />
            </label>
            <button className="btn btn-primary btn-lg" disabled={importing || !picked} onClick={importFile}>
              {importing ? "AI đang đọc (khoảng 1 phút)…" : "Nhập vào biên bản"}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
      {ok && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}
    </div>
  );
}
