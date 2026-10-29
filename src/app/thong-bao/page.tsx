import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import MarkRead from "@/components/MarkRead";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_notifications").select("*").order("created_at", { ascending: false }).limit(50);
  const list = (data ?? []) as Notification[];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Thông báo</h1>
        {unread > 0 && <MarkRead />}
      </div>
      <div className="listcard mt-4">
        {list.length === 0 && <p className="text-sm text-gray-500">Chưa có thông báo nào.</p>}
        {list.map((n) => (
          <div key={n.id} className="listrow !grid-cols-[2.8rem_minmax(0,1fr)]">
            <span className="docicon" aria-hidden>{n.read_at ? "🔔" : "🔴"}</span>
            <div className="min-w-0">
              <p className={n.read_at ? "font-medium" : "font-bold"}>{n.title}</p>
              {n.body && <p className="whitespace-pre-wrap text-sm text-gray-600">{n.body}</p>}
              <p className="mt-1 text-xs text-gray-500">
                {fmtDateTime(n.created_at)}
                {n.kind === "lich_hop" && <> · <Link href="/lich-sinh-hoat" className="underline">Xem lịch sinh hoạt</Link></>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
