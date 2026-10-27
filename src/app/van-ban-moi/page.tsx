import { requireLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LeaderFiles from "@/components/LeaderFiles";
import type { FileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireLeader();
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_files").select("*").eq("kind", "van_ban_moi").order("created_at", { ascending: false });
  return (
    <div>
      <h1 className="text-xl font-semibold">Văn bản mới</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">Tải văn bản mới của Bộ, Sở, nhà trường. Bấm Áp dụng, AI tóm tắt và hỏi bạn áp dụng cho biên bản nào. Biên bản đã họp không bị sửa.</p>
      <LeaderFiles kind="van_ban_moi" files={(data ?? []) as FileRow[]} me={me.id} actionLabel="Áp dụng" />
    </div>
  );
}
