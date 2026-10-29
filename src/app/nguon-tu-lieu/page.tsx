import { requireLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAiSettings } from "@/lib/ai-config";
import SourcesManager, { type SourceRow } from "@/components/SourcesManager";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireLeader();
  const supabase = await createClient();
  const [{ data }, ai] = await Promise.all([
    supabase.from("shcm_sources").select("id, kind, title, url, note, file_name, size_bytes, enabled, created_at, text_content").order("created_at", { ascending: false }),
    loadAiSettings(),
  ]);
  const rows: SourceRow[] = (data ?? []).filter((r) => r.kind !== "mau_bieu").map((r) => ({ ...r, chars: r.text_content?.length ?? 0, text_content: undefined })) as SourceRow[];
  return (
    <div>
      <h1 className="text-xl font-bold">Nguồn tư liệu cho AI</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        AI chỉ tham khảo những nguồn đang bật khi soạn nội dung biên bản. Thầy thêm, bớt, bật, tắt từng nguồn như một cuốn sổ tư liệu.
      </p>
      <SourcesManager only={["ke_hoach", "van_ban", "lich"]} key={rows.map((r) => r.id + r.enabled + r.chars).join(",")} rows={rows} me={me.id} skill={ai.skill} />
    </div>
  );
}
