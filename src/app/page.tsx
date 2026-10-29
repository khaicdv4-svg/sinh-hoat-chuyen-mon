import Link from "next/link";
import { requireMember, isLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtWeekday, todayVN } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import { TEAM_NAME } from "@/lib/constants";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_meetings").select("*").order("position").order("week_from").order("meeting_date");
  const meetings = (data ?? []) as Meeting[];
  const today = todayVN();
  const next = meetings.find((m) => m.status === "open" && m.meeting_date && m.meeting_date >= today);
  const regular = meetings.filter((m) => m.kind === "sinh_hoat");
  const other = meetings.filter((m) => m.kind !== "sinh_hoat");

  const weeks = (m: Meeting) => (m.week_from != null ? `Tuần ${m.week_from}${m.week_to && m.week_to !== m.week_from ? ` + ${m.week_to}` : ""}` : "");

  const row = (m: Meeting) => {
    const past = m.meeting_date && m.meeting_date < today && m.status === "open";
    return (
      <Link key={m.id} href={`/bien-ban/${m.id}`} className="card grid items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_11rem_11rem_4rem]">
        <div className="min-w-0 font-semibold">{m.title}{m.topic ? <span className="block truncate text-sm font-normal text-gray-500">{m.topic}</span> : null}</div>
        <div className="text-sm text-gray-600">{weeks(m)}</div>
        <div className="text-sm text-gray-600">{m.meeting_date ? `${fmtWeekday(m.meeting_date)}, ${fmtDate(m.meeting_date)}` : "Chưa định ngày"}</div>
        <div className="flex flex-wrap gap-1.5">
          {m.id === next?.id && <span className="badge badge-warn">Sắp họp</span>}
          {past && <span className="badge badge-warn">Quá ngày, chưa khóa</span>}
          <span className={`badge ${m.status === "locked" ? "badge-locked" : "badge-open"}`}>{m.status === "locked" ? "Đã khóa" : "Đang mở"}</span>
        </div>
        <span className="btn btn-sm btn-primary justify-self-start sm:justify-self-end">Mở</span>
      </Link>
    );
  };

  return (
    <div>
      {sp.error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</p>}

      <div className="mb-4">
        <div className="mb-1 text-center text-3xl" aria-hidden>🏫 📚 ✏️</div>
        <h1 className="banner-title">Sinh hoạt chuyên môn</h1>
        <p className="banner-sub">{TEAM_NAME}</p>
      </div>

      <div className="fn-grid">
        {isLeader(me) && (
          <Link href="/bien-ban/moi" className="fn-card"><span className="fn-icon" aria-hidden>➕</span>Tạo biên bản mới</Link>
        )}
        <a href="#danh-sach" className="fn-card"><span className="fn-icon" aria-hidden>📋</span>Danh sách biên bản</a>
      </div>

      {next && (
        <div className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-white">
          Buổi tiếp theo: <b>{next.title}</b>, {fmtWeekday(next.meeting_date)} {fmtDate(next.meeting_date)}.{" "}
          <Link href={`/bien-ban/${next.id}`} className="underline">
            Mở biên bản
          </Link>
        </div>
      )}

      <h2 id="danh-sach" className="mb-2 mt-5 scroll-mt-20 text-lg font-semibold">Biên bản sinh hoạt chuyên môn cả năm</h2>
      <div className="grid gap-2">{regular.map(row)}</div>
      {other.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 font-semibold">Biên bản khác</h2>
          <div className="grid gap-2">{other.map(row)}</div>
        </>
      )}
    </div>
  );
}
