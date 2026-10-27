import { requireLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewMeeting from "@/components/NewMeeting";
import type { Template } from "@/lib/types";

export default async function Page() {
  const me = await requireLeader();
  const supabase = await createClient();
  const [{ data: tpls }, { data: ms }] = await Promise.all([
    supabase.from("shcm_templates").select("*").order("name"),
    supabase.from("shcm_meetings").select("id, title").order("position").order("week_from"),
  ]);
  return (
    <div>
      <h1 className="text-xl font-semibold">Thêm biên bản</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">Ví dụ biên bản thống nhất đề kiểm tra, biên bản chuyên đề riêng. Chọn mẫu có sẵn, hoặc mô tả để AI dựng đề mục, hoặc sao từ biên bản đã có.</p>
      <NewMeeting
        me={me.id}
        templates={(tpls ?? []) as Template[]}
        meetings={(ms ?? []) as { id: string; title: string }[]}
      />
    </div>
  );
}
