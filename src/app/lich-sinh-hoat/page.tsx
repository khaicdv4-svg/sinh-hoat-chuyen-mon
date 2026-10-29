import { requireMember, isLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayVN } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import ScheduleCard from "@/components/ScheduleCard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_meetings").select("*").eq("kind", "sinh_hoat").order("meeting_date", { ascending: true, nullsFirst: false }).order("week_from");
  const all = (data ?? []) as Meeting[];
  const today = todayVN();
  const upcoming = all.filter((m) => !m.meeting_date || m.meeting_date >= today);
  const past = all.filter((m) => m.meeting_date && m.meeting_date < today).reverse();
  const next = upcoming.find((m) => m.status === "open" && m.meeting_date);
  const leader = isLeader(me);

  return (
    <div>
      <h1 className="text-xl font-bold">Lịch sinh hoạt chuyên môn</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        Mỗi buổi họp có hai hình thức: sinh hoạt trực tiếp hoặc sinh hoạt trực tuyến.
        {leader ? " Thầy chọn hình thức cho từng buổi rồi bấm \"Lưu và gửi thông báo\", cả tổ sẽ nhận được thông báo trong ứng dụng." : " Hình thức họp do tổ trưởng chọn, bạn sẽ nhận thông báo khi có thay đổi."}
      </p>

      <h2 className="mb-2 font-semibold">Sắp tới</h2>
      <div className="grid gap-3">
        {upcoming.map((m) => <ScheduleCard key={m.id} m={m} leader={leader} isNext={m.id === next?.id} />)}
        {!upcoming.length && <p className="text-sm text-gray-500">Chưa có buổi họp nào sắp tới.</p>}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 font-semibold">Đã qua</h2>
          <div className="grid gap-3">{past.map((m) => <ScheduleCard key={m.id} m={m} leader={leader} isNext={false} />)}</div>
        </>
      )}
    </div>
  );
}
