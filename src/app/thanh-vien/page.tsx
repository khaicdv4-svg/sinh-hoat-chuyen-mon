import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MemberRow from "@/components/MemberRow";
import Roster from "@/components/Roster";
import type { Member, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: roster }] = await Promise.all([
    supabase.from("shcm_profiles").select("*").order("created_at"),
    supabase.from("shcm_members").select("*").order("sort_order"),
  ]);
  const all = (data ?? []) as Profile[];
  const pending = all.filter((p) => p.status === "pending");
  const rest = all.filter((p) => p.status !== "pending");
  return (
    <div>
      <h1 className="text-xl font-semibold">Thành viên tổ</h1>
      <p className="mb-3 mt-1 text-sm text-gray-600">
        Danh sách này dùng cho phần thành phần tham dự, điểm danh, ý kiến và chữ ký trong biên bản. Thầy cô nào có email ở đây thì khi đăng nhập
        sẽ tự nối với tên của mình.
      </p>
      <Roster key={(roster ?? []).map((m) => m.id).join(",")} members={(roster ?? []) as Member[]} />

      <h2 className="mb-2 mt-8 font-semibold">Tài khoản chờ duyệt ({pending.length})</h2>
      <div className="grid gap-2">
        {pending.length === 0 && <p className="text-sm text-gray-500">Không có tài khoản nào chờ duyệt.</p>}
        {pending.map((p) => <MemberRow key={p.id} p={p} />)}
      </div>
      <h2 className="mb-2 mt-8 font-semibold">Tài khoản đã xử lí</h2>
      <div className="grid gap-2">{rest.map((p) => <MemberRow key={p.id} p={p} />)}</div>
    </div>
  );
}
