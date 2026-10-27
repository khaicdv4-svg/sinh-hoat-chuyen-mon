import { requireLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LeaderFiles from "@/components/LeaderFiles";
import type { FileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireLeader();
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_files").select("*").eq("kind", "ke_hoach").order("created_at", { ascending: false });
  return (
    <div>
      <h1 className="text-xl font-semibold">Kế hoạch chuyên môn năm học</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">Tải kế hoạch chuyên môn của tổ lên. AI đọc và chia việc vào từng biên bản theo thời gian; bạn xem lại rồi mới nhận vào biên bản.</p>
      <LeaderFiles kind="ke_hoach" files={(data ?? []) as FileRow[]} me={me.id} actionLabel="AI chia nhiệm vụ" />
    </div>
  );
}
