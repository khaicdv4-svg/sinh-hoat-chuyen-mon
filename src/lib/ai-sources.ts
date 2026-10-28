import type { Guard } from "@/lib/ai";

export const SOURCE_KINDS = {
  ke_hoach: "Kế hoạch",
  van_ban: "Văn bản, công văn",
  lich: "Lịch và Drive",
} as const;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

/** Gom nội dung các nguồn đang bật thành một khối để đưa cho AI tham khảo. */
export async function loadSourcesText(g: Guard, maxChars = 36000): Promise<string> {
  const { data } = await g.supabase
    .from("shcm_sources")
    .select("kind, title, url, note, text_content")
    .eq("enabled", true)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  if (!rows.length) return "";
  const out: string[] = [];
  let left = maxChars;
  for (const kind of ["ke_hoach", "van_ban", "lich"] as const) {
    for (const r of rows.filter((x) => x.kind === kind)) {
      if (left < 400) break;
      const head = `[Nguồn ${SOURCE_KINDS[kind].toLowerCase()}: ${r.title}${r.url ? ` — ${r.url}` : ""}]`;
      const body = [r.note, r.text_content].filter(Boolean).join("\n");
      const piece = `${head}\n${clip(body.trim(), Math.min(14000, left - head.length))}`;
      out.push(piece);
      left -= piece.length;
    }
  }
  return out.join("\n\n");
}
