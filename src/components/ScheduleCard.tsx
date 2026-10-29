"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Meeting } from "@/lib/types";
import { setMeetingFormat } from "@/app/lich-sinh-hoat/actions";
import { FORMAT_LABELS, PLATFORMS } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtTime, fmtWeekday } from "@/lib/format";

export default function ScheduleCard({ m, leader, isNext }: { m: Meeting; leader: boolean; isNext: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"truc_tiep" | "truc_tuyen">(m.format ?? "truc_tiep");
  const [place, setPlace] = useState(m.format === "truc_tuyen" ? "" : m.place ?? "");
  const [platform, setPlatform] = useState(m.online_platform ?? "Google Meet");
  const [link, setLink] = useState(m.online_link ?? "");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  const locked = m.status === "locked";
  const [y, mo, d] = (m.meeting_date ?? "").split("-");
  const weeks = m.week_from != null ? `Tuần ${m.week_from}${m.week_to && m.week_to !== m.week_from ? ` + ${m.week_to}` : ""}` : "";

  function save() {
    setMsg(""); setOk("");
    start(async () => {
      const r = await setMeetingFormat(m.id, { format, place, platform, link, notify });
      if (!r.ok) { setMsg(r.error); return; }
      const parts: string[] = ["Đã lưu hình thức họp."];
      if (notify) parts.push(r.sent ? `Đã gửi thông báo cho ${r.sent} thành viên trong ứng dụng${r.emailed ? ` và ${r.emailed} thư điện tử` : ""}.` : "Chưa có thành viên nào để gửi thông báo.");
      if (r.note) parts.push(r.note);
      setOk(parts.join(" "));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <article className="listcard !p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[var(--brand)] text-center text-white shadow-[var(--raised-sm)]">
          {m.meeting_date ? (
            <span className="leading-tight"><span className="block text-2xl font-extrabold">{d}</span><span className="block text-xs">Th{Number(mo)}/{y.slice(2)}</span></span>
          ) : <span className="text-xs">Chưa có ngày</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/bien-ban/${m.id}`} className="font-bold hover:underline">{m.title}</Link>
            {isNext && <span className="pill badge-warn">Sắp họp</span>}
            {locked && <span className="pill badge-locked">Đã khóa</span>}
          </div>
          <p className="text-sm text-gray-600">
            {weeks}{weeks && m.meeting_date ? " · " : ""}{m.meeting_date ? `${fmtWeekday(m.meeting_date)}, ${fmtDate(m.meeting_date)}` : ""}{m.meeting_time ? `, ${fmtTime(m.meeting_time)}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {m.format ? (
              <span className={`pill ${m.format === "truc_tuyen" ? "bg-[var(--tint-purple)] text-[#5b3bb4]" : "bg-[var(--tint-green)] text-[#14653f]"}`}>
                {m.format === "truc_tuyen" ? "💻" : "🏢"} {FORMAT_LABELS[m.format]}
              </span>
            ) : <span className="pill bg-[var(--tint-orange)] text-[#9a5a0a]">Chưa chọn hình thức họp</span>}
            {m.format === "truc_tiep" && m.place && <span className="text-gray-600">Tại {m.place}</span>}
            {m.format === "truc_tuyen" && m.online_link && (
              <a href={m.online_link} target="_blank" rel="noreferrer" className="font-semibold text-[var(--brand)] underline">Vào phòng họp{m.online_platform ? ` (${m.online_platform})` : ""}</a>
            )}
          </div>
          {m.format_notified_at && <p className="mt-1 text-xs text-gray-500">Đã thông báo cho thành viên lúc {fmtDateTime(m.format_notified_at)}</p>}
        </div>
        {leader && !locked && (
          <button type="button" className="btn btn-sm btn-accent" onClick={() => setOpen(!open)}>{open ? "Đóng" : m.format ? "Đổi hình thức" : "Chọn hình thức họp"}</button>
        )}
      </div>

      {open && leader && (
        <div className="well mt-3 grid gap-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["truc_tiep", "truc_tuyen"] as const).map((f) => (
              <label key={f} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${format === f ? "border-[var(--brand)] bg-[var(--surface)]" : "border-transparent"}`}>
                <input type="radio" name={`fmt-${m.id}`} checked={format === f} onChange={() => setFormat(f)} />
                <span className="text-2xl" aria-hidden>{f === "truc_tiep" ? "🏢" : "💻"}</span>
                <span className="font-semibold">{FORMAT_LABELS[f]}</span>
              </label>
            ))}
          </div>
          {format === "truc_tiep" ? (
            <label className="text-sm">Địa điểm họp
              <input className="input mt-1" value={place} placeholder="Ví dụ: Phòng họp hội đồng" onChange={(e) => setPlace(e.target.value)} />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <label className="text-sm">Nền tảng
                <select className="input mt-1" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-sm">Đường dẫn phòng họp
                <input className="input mt-1" value={link} placeholder="https://meet.google.com/…" onChange={(e) => setLink(e.target.value)} />
              </label>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Gửi thông báo cho các thành viên trong tổ{m.format_notified_at ? " (đã gửi một lần, lần này là bản cập nhật)" : ""}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Đang lưu…" : notify ? "Lưu và gửi thông báo" : "Lưu"}</button>
            {msg && <span className="text-sm text-red-700">{msg}</span>}
          </div>
        </div>
      )}
      {ok && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}
    </article>
  );
}
