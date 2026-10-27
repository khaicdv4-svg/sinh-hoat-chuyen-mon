import Link from "next/link";
import { requireMember, isLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtWeekday, todayVN } from "@/lib/format";
import type { Meeting } from "@/lib/types";

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

  const row = (m: Meeting) => {
    const past = m.meeting_date && m.meeting_date < today && m.status === "open";
    return (
      <Link key={m.id} href={`/bien-ban/${m.id}`} className="card flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[#f7f5ee]">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{m.title}</div>
          <div className="text-sm text-gray-500">
            {m.meeting_date ? `${fmtWeekday(m.meeting_date)}, ${fmtDate(m.meeting_date)}` : "Chưa định ngày"}
            {m.topic ? ` · ${m.topic}` : ""}
          </div>
        </div>
        {m.id === next?.id && <span className="badge badge-warn">Sắp họp</span>}
        {past && <span className="badge badge-warn">Quá ngày, chưa khóa</span>}
        <span className={`badge ${m.status === "locked" ? "badge-locked" : "badge-open"}`}>{m.status === "locked" ? "Đã khóa" : "Đang mở"}</span>
      </Link>
    );
  };

  return (
    <div>
      {sp.error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Biên bản sinh hoạt chuyên môn cả năm</h1>
        {isLeader(me) && (
          <Link href="/bien-ban/moi" className="btn btn-sm ml-auto">
            + Thêm biên bản
          </Link>
        )}
      </div>
      {next && (
        <div className="mb-5 rounded-xl bg-[var(--brand)] px-4 py-3 text-white">
          Buổi tiếp theo: <b>{next.title}</b>, {fmtWeekday(next.meeting_date)} {fmtDate(next.meeting_date)}.{" "}
          <Link href={`/bien-ban/${next.id}`} className="underline">
            Mở biên bản
          </Link>
        </div>
      )}
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
