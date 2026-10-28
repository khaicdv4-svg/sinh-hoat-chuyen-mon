import type { Guard } from "@/lib/ai";
import { SCHOOL_NAME, SCHOOL_YEAR, TEAM_NAME } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

type Opts = {
  meetingId: string;
  sectionId?: string;
  speakerId?: string | null;
  /** "none": chỉ phần đầu (buổi họp, thành viên, buổi trước). "all": thêm nội dung đã ghi ở mọi mục. */
  entries: "none" | "all";
  maxChars?: number;
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

/**
 * Gom bối cảnh của buổi sinh hoạt để AI hiểu việc đang làm: tổ, buổi họp, mục đang ghi,
 * kết luận buổi trước, nhiệm vụ, và những gì đã được ghi trong buổi. Chỉ lấy nội dung đã nhận (accepted).
 */
export async function buildContext(g: Guard, o: Opts): Promise<string> {
  const max = o.maxChars ?? 9000;
  const sb = g.supabase;

  const { data: m } = await sb.from("shcm_meetings").select("*").eq("id", o.meetingId).maybeSingle();
  if (!m) return "";
  const [secRes, memRes, prevRes] = await Promise.all([
    sb.from("shcm_sections").select("id, key, title, hint, position").eq("meeting_id", o.meetingId).order("position"),
    sb.from("shcm_members").select("id, honorific, full_name, title, is_chair, active").order("sort_order"),
    sb.from("shcm_meetings").select("id, title, week_from, week_to").lt("position", m.position).order("position", { ascending: false }).limit(1),
  ]);
  const sections = secRes.data ?? [];
  const roster = (memRes.data ?? []).filter((x) => x.active !== false);
  const prev = prevRes.data?.[0];

  const nameOf = (id?: string | null) => {
    const x = roster.find((r) => r.id === id);
    return x ? `${x.honorific} ${x.full_name}` : "";
  };

  const out: string[] = [];
  out.push(`Tổ: ${TEAM_NAME}, ${SCHOOL_NAME}, năm học ${SCHOOL_YEAR}. Khối lớp 4, sách Kết nối tri thức. Sinh hoạt chuyên môn theo hướng nghiên cứu bài học (NCBH).`);
  const weeks = m.week_from ? `tuần ${m.week_from}${m.week_to && m.week_to !== m.week_from ? `–${m.week_to}` : ""}` : "";
  out.push(
    `Buổi sinh hoạt: ${m.title}${weeks ? `, ${weeks}` : ""}${m.meeting_date ? `, ngày ${fmtDate(m.meeting_date)}` : ""}` +
      `${m.ncbh_stage ? `. Giai đoạn NCBH đang thực hiện: ${m.ncbh_stage}` : ""}${m.topic ? `. Chuyên đề/nội dung: ${m.topic}` : ""}${m.subject ? `. Môn: ${m.subject}` : ""}.`,
  );
  if (roster.length) {
    out.push("Thành viên tổ: " + roster.map((r) => `${r.honorific} ${r.full_name}${r.title ? ` (${r.title})` : ""}`).join("; ") + ".");
  }
  if (o.speakerId) {
    const sp = nameOf(o.speakerId);
    if (sp) out.push(`Người đang phát biểu: ${sp}.`);
  }
  const cur = o.sectionId ? sections.find((s) => s.id === o.sectionId) : null;
  if (cur) out.push(`Mục đang ghi: "${cur.title}"${cur.hint ? `. Mục đích của mục: ${cur.hint}` : ""}`);

  // Tất cả nội dung đã nhận của buổi này
  const ids = sections.map((s) => s.id);
  const { data: ents } = ids.length
    ? await sb.from("shcm_entries").select("section_id, body, speaker_id, created_at").in("section_id", ids).eq("status", "accepted").order("created_at")
    : { data: [] as { section_id: string; body: string; speaker_id: string | null }[] };

  const render = (sid: string, perLine: number) =>
    (ents ?? [])
      .filter((e) => e.section_id === sid)
      .map((e) => {
        const sp = nameOf(e.speaker_id);
        return `- ${sp ? sp + ": " : ""}${clip(e.body.replace(/\s+/g, " "), perLine)}`;
      });

  // Nhiệm vụ / chương trình và văn bản áp dụng của buổi
  for (const key of ["chuong_trinh", "van_ban"]) {
    const s = sections.find((x) => x.key === key);
    if (!s) continue;
    const lines = render(s.id, 500);
    if (lines.length) out.push(`\n[${s.title}]\n${lines.slice(0, 12).join("\n")}`);
  }

  // Kết luận buổi trước (để nối mạch, nhớ việc còn dở)
  if (prev) {
    const { data: ps } = await sb.from("shcm_sections").select("id, title").eq("meeting_id", prev.id).eq("key", "ket_luan").maybeSingle();
    if (ps) {
      const { data: pe } = await sb.from("shcm_entries").select("body").eq("section_id", ps.id).eq("status", "accepted").order("created_at");
      const body = (pe ?? []).map((e) => e.body).join("\n");
      if (body.trim()) out.push(`\n[Kết luận buổi trước: ${prev.title}]\n${clip(body, 1200)}`);
    }
  }

  if (o.entries === "all") {
    for (const s of sections) {
      if (["chuong_trinh", "van_ban", "ket_luan"].includes(s.key)) continue;
      const lines = render(s.id, 400);
      if (!lines.length) continue;
      out.push(`\n[${s.title}${s.id === o.sectionId ? " (mục đang ghi)" : ""}]\n${lines.slice(0, 15).join("\n")}`);
    }
  }

  return clip(out.join("\n"), max);
}
