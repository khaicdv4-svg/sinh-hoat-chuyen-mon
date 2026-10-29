import { requireMember, isLeader } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayVN } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import HomeView from "@/components/HomeView";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireMember();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_meetings").select("*").order("position").order("week_from").order("meeting_date");
  const { data: notes } = await supabase.from("shcm_notifications").select("id, title, body, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(3);
  return <HomeView meetings={(data ?? []) as Meeting[]} notes={notes ?? []} leader={isLeader(me)} today={todayVN()} error={sp.error} />;
}
