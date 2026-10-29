import type { Guard } from "@/lib/ai";

export const SOURCE_KINDS = {
  ke_hoach: "Kế hoạch",
  van_ban: "Văn bản, công văn",
  lich: "Lịch và Drive",
  mau_bieu: "Biểu mẫu",
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
  for (const kind of ["ke_hoach", "van_ban", "lich"] as const) { // biểu mẫu lấy riêng bằng loadFormsText
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

/**
 * Biểu mẫu của tổ (biên bản mẫu, mẫu trình bày…). AI dùng để học bố cục, cách xưng hô, giọng văn;
 * không chép nội dung cụ thể của buổi họp cũ.
 */
export async function loadFormsText(g: Guard, maxChars = 24000): Promise<string> {
  const { data } = await g.supabase
    .from("shcm_sources")
    .select("title, note, text_content")
    .eq("kind", "mau_bieu")
    .eq("enabled", true)
    .order("created_at", { ascending: false });
  const out: string[] = [];
  let left = maxChars;
  for (const r of data ?? []) {
    if (left < 400) break;
    const head = `[Biểu mẫu: ${r.title}]`;
    const body = [r.note, r.text_content].filter(Boolean).join("\n").trim();
    if (!body) continue;
    const piece = `${head}\n${clip(body, Math.min(10000, left - head.length))}`;
    out.push(piece);
    left -= piece.length;
  }
  return out.join("\n\n");
}

export const FORMS_RULE = `Biểu mẫu của tổ (nếu có) cho biết cách trình bày, thứ tự ý, cách xưng hô và giọng văn của biên bản. Viết theo mẫu đó. Không chép lại nội dung, tên người, số liệu của buổi họp cũ trong mẫu.`;
