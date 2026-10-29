import Link from "next/link";
import { requireMember, isLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtWeekday, todayVN } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import { SCHOOL_NAME, TEAM_NAME } from "@/lib/constants";
import Logo from "@/components/Logo";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_meetings").select("*").order("position").order("week_from").order("meeting_date");
  const meetings = (data ?? []) as Meeting[];
  const today = todayVN();
  const next = meetings.find((m) => m.status === "open" && m.meeting_date && m.meeting_date >= today);
  const { data: notes } = await supabase.from("shcm_notifications").select("id, title, body, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(3);
  const regular = meetings.filter((m) => m.kind === "sinh_hoat");
  const other = meetings.filter((m) => m.kind !== "sinh_hoat");

  const weeks = (m: Meeting) => (m.week_from != null ? `Tuần ${m.week_from}${m.week_to && m.week_to !== m.week_from ? ` – ${m.week_to}` : ""}` : "");

  const row = (m: Meeting) => {
    const past = m.meeting_date && m.meeting_date < today && m.status === "open";
    const locked = m.status === "locked";
    return (
      <Link key={m.id} href={`/bien-ban/${m.id}`} className="listrow">
        <span className="docicon row-span-2 sm:row-span-1" aria-hidden>📄</span>
        <div className="min-w-0">
          <div className="font-semibold leading-snug">{m.title}</div>
          <div className="text-sm text-gray-500">
            {weeks(m)}{weeks(m) && m.topic ? " · " : ""}{m.topic}
            <span className="sm:hidden">{m.meeting_date ? ` · ${fmtDate(m.meeting_date)}` : ""}</span>
          </div>
        </div>
        <div className="hidden text-sm text-gray-600 sm:block">{m.meeting_date ? `${fmtWeekday(m.meeting_date)}, ${fmtDate(m.meeting_date)}` : "Chưa định ngày"}</div>
        <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-auto">
          {m.id === next?.id && <span className="pill badge-warn">Sắp họp</span>}
          {past && <span className="pill badge-warn">Quá ngày, chưa khóa</span>}
          <span className={`pill ${locked ? "badge-locked" : "badge-open"}`}>{locked ? "Đã khóa" : "Đang mở"}</span>
        </div>
        <span className="hidden text-lg text-gray-500 sm:block" aria-label="Mở">›</span>
      </Link>
    );
  };

  return (
    <div>
      {sp.error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</p>}

      <section className="hero">
        <Logo size={84} />
        <div className="min-w-0">
          <h1 className="hero-title">Sinh hoạt chuyên môn</h1>
          <p className="hero-team">{TEAM_NAME}</p>
          <span className="hero-school">{SCHOOL_NAME}</span>
        </div>
        <div className="board" aria-hidden>Đoàn kết<br />Chia sẻ<br />Cùng tiến bộ <span style={{ color: "#ff7b86" }}>♥</span></div>
      </section>

      <div className="fn-grid mt-4">
        {isLeader(me) && (
          <Link href="/bien-ban/moi" className="fn-card" style={{ ["--tint" as string]: "var(--tint-green)", ["--icon" as string]: "#17a673" }}>
            <span className="fn-icon" aria-hidden>📝</span>
            <span className="min-w-0"><span className="fn-title">Tạo biên bản mới</span><span className="fn-sub">Soạn biên bản buổi họp</span></span>
            <span className="fn-go" aria-hidden>›</span>
          </Link>
        )}
        <Link href="/lich-sinh-hoat" className="fn-card" style={{ ["--tint" as string]: "var(--tint-purple)", ["--icon" as string]: "#7a54d6" }}>
          <span className="fn-icon" aria-hidden>📅</span>
          <span className="min-w-0"><span className="fn-title">Lịch sinh hoạt</span><span className="fn-sub">Trực tiếp – Trực tuyến</span></span>
          <span className="fn-go" aria-hidden>›</span>
        </Link>
        <a href="#danh-sach" className="fn-card" style={{ ["--tint" as string]: "var(--tint-blue)", ["--icon" as string]: "#2f7de1" }}>
          <span className="fn-icon" aria-hidden>👥</span>
          <span className="min-w-0"><span className="fn-title">Danh sách biên bản</span><span className="fn-sub">Xem, mở biên bản</span></span>
          <span className="fn-go" aria-hidden>›</span>
        </a>
      </div>

      {(notes ?? []).length > 0 && (
        <Link href="/thong-bao" className="mt-4 block rounded-2xl border border-[#f3d9a4] bg-[var(--tint-orange)] px-4 py-3 shadow-[var(--raised-sm)]">
          <p className="font-bold">🔔 Thông báo mới</p>
          {(notes ?? []).map((n) => <p key={n.id} className="text-sm">• {n.title}</p>)}
          <p className="mt-1 text-xs text-gray-600">Bấm để xem chi tiết</p>
        </Link>
      )}

      {next && (
        <div className="mt-4 rounded-2xl bg-[var(--brand)] px-4 py-3 text-white shadow-[var(--raised-sm)]">
          Buổi tiếp theo: <b>{next.title}</b>, {fmtWeekday(next.meeting_date)} {fmtDate(next.meeting_date)}.{" "}
          <Link href={`/bien-ban/${next.id}`} className="underline">
            Mở biên bản
          </Link>
        </div>
      )}

      <section id="danh-sach" className="listcard mt-4 scroll-mt-20">
        <div className="listhead">
          <span className="docicon" aria-hidden>📋</span>
          <h2 className="text-lg font-bold">Biên bản sinh hoạt chuyên môn cả năm</h2>
        </div>
        <div>{regular.map(row)}</div>
        {other.length > 0 && (
          <>
            <h2 className="mb-1 mt-6 font-semibold">Biên bản khác</h2>
            <div>{other.map(row)}</div>
          </>
        )}
      </section>
    </div>
  );
}
