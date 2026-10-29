import { requireLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SourcesManager, { type SourceRow } from "@/components/SourcesManager";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireLeader();
  const supabase = await createClient();
  const { data } = await supabase
    .from("shcm_sources")
    .select("id, kind, title, url, note, file_name, size_bytes, enabled, created_at, text_content")
    .eq("kind", "mau_bieu")
    .order("created_at", { ascending: false });
  const rows: SourceRow[] = (data ?? []).map((r) => ({ ...r, chars: r.text_content?.length ?? 0, text_content: undefined })) as SourceRow[];
  return (
    <div>
      <h1 className="text-xl font-bold">Biểu mẫu</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        Thầy tải biên bản mẫu của trường, của tổ lên đây. Mỗi lần AI soạn biên bản, AI xem các mẫu đang bật để viết đúng bố cục, cách xưng hô và giọng văn.
        AI chỉ học cách trình bày, không chép lại nội dung của buổi họp cũ.
      </p>
      <SourcesManager only={["mau_bieu"]} showSkill={false} key={rows.map((r) => r.id + r.enabled + r.chars).join(",")} rows={rows} me={me.id} skill="" />
    </div>
  );
}
