import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MemberRow from "@/components/MemberRow";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_profiles").select("*").order("created_at");
  const all = (data ?? []) as Profile[];
  const pending = all.filter((p) => p.status === "pending");
  const rest = all.filter((p) => p.status !== "pending");
  return (
    <div>
      <h1 className="text-xl font-semibold">Thành viên</h1>
      <h2 className="mb-2 mt-5 font-medium">Chờ duyệt ({pending.length})</h2>
      <div className="grid gap-2">
        {pending.length === 0 && <p className="text-sm text-gray-500">Không có tài khoản nào chờ duyệt.</p>}
        {pending.map((p) => <MemberRow key={p.id} p={p} />)}
      </div>
      <h2 className="mb-2 mt-8 font-medium">Đã xử lí</h2>
      <div className="grid gap-2">{rest.map((p) => <MemberRow key={p.id} p={p} />)}</div>
    </div>
  );
}
