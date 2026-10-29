import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, todayVN } from "@/lib/format";
import type { Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Thống kê đơn giản, chỉ đọc từ dữ liệu biên bản có sẵn. */
export default async function Page() {
  await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_meetings").select("*").eq("kind", "sinh_hoat").order("week_from");
  const all = (data ?? []) as Meeting[];
  const today = todayVN();
  const locked = all.filter((m) => m.status === "locked");
  const open = all.filter((m) => m.status === "open");
  const overdue = open.filter((m) => m.meeting_date && m.meeting_date < today);
  const upcoming = open.filter((m) => m.meeting_date && m.meeting_date >= today);
  const noDate = all.filter((m) => !m.meeting_date);
  const online = all.filter((m) => m.format === "truc_tuyen").length;
  const direct = all.filter((m) => m.format === "truc_tiep").length;
  const stat = (n: number, label: string) => (
    <div className="card p-4 text-center"><div className="text-3xl font-extrabold text-[var(--brand)]">{n}</div><div className="mt-1 text-sm text-gray-600">{label}</div></div>
  );
  return (
    <div>
      <h1 className="text-xl font-bold">Thống kê – Báo cáo</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">Số liệu lấy trực tiếp từ các biên bản sinh hoạt chuyên môn trong năm học.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(all.length, "Biên bản cả năm")}
        {stat(locked.length, "Đã khóa (hoàn tất)")}
        {stat(open.length, "Đang mở")}
        {stat(upcoming.length, "Sắp họp")}
        {stat(overdue.length, "Quá ngày, chưa khóa")}
        {stat(noDate.length, "Chưa định ngày")}
        {stat(direct, "Họp trực tiếp")}
        {stat(online, "Họp trực tuyến")}
      </div>
      {overdue.length > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="font-semibold">Cần khóa biên bản</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {overdue.map((m) => <li key={m.id}><a className="underline" href={`/bien-ban/${m.id}`}>{m.title}</a> · {fmtDate(m.meeting_date)}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
