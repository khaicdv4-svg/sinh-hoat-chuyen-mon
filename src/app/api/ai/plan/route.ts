import { aiGuard, askTool, errorResponse, fileToBlocks, SYSTEM_BASE, AiError, type Block } from "@/lib/ai";
import { fmtDate } from "@/lib/format";

export const maxDuration = 300;

/** Chia nhiệm vụ trong kế hoạch chuyên môn năm vào từng biên bản theo thời điểm. */
export async function POST(req: Request) {
  try {
    const { fileId } = (await req.json()) as { fileId?: string };
    if (!fileId) throw new AiError("Thiếu tệp kế hoạch.");
    const g = await aiGuard({ leaderOnly: true });
    const { data: file } = await g.supabase.from("shcm_files").select("*").eq("id", fileId).eq("kind", "ke_hoach").maybeSingle();
    if (!file) throw new AiError("Không tìm thấy tệp kế hoạch.", 404);

    const { data: meetings } = await g.supabase.from("shcm_meetings").select("id, title, week_from, week_to, meeting_date, status").eq("kind", "sinh_hoat").order("week_from");
    const open = (meetings ?? []).filter((m) => m.status === "open");
    if (!open.length) throw new AiError("Không còn biên bản nào đang mở để chia nhiệm vụ.", 409);

    const doc = await fileToBlocks(g, file.storage_path, file.file_name, file.mime_type);
    const list = open.map((m) => `- Tuần ${m.week_from}-${m.week_to} (họp ${fmtDate(m.meeting_date)})`).join("\n");
    const content: Block[] = [
      ...doc,
      { type: "text", text: `Các biên bản sinh hoạt (mỗi buổi gồm 2 tuần học của năm học 2026-2027):\n${list}\n\nHãy chia các nhiệm vụ, nội dung, công việc trong kế hoạch vào đúng biên bản theo thời gian thực hiện (tháng, tuần hoặc học kì ghi trong kế hoạch). Việc kéo dài cả năm hoặc không nêu thời gian thì xếp vào biên bản đầu tiên, ghi rõ là việc thường xuyên.` },
    ];

    const out = await askTool<{ phan_cong: { tuan: number; viec: string[] }[] }>(
      g, "chia_ke_hoach",
      `${SYSTEM_BASE}\nNhiệm vụ: đọc kế hoạch chuyên môn và phân bổ công việc vào từng buổi sinh hoạt. Mỗi việc viết một câu gọn, nêu rõ việc gì, ai làm nếu kế hoạch có nói. Không bịa việc ngoài kế hoạch.`,
      content,
      {
        name: "chia_nhiem_vu",
        description: "Trả về danh sách việc theo tuần bắt đầu của từng buổi sinh hoạt",
        input_schema: {
          type: "object",
          properties: {
            phan_cong: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tuan: { type: "integer", description: "Tuần đầu của biên bản (tuần lẻ: 1, 3, 5…)" },
                  viec: { type: "array", items: { type: "string" } },
                },
                required: ["tuan", "viec"],
              },
            },
          },
          required: ["phan_cong"],
        },
      },
      8000,
    );

    // Gỡ các đề xuất cũ từ cùng tệp rồi ghi lại
    await g.supabase.from("shcm_entries").delete().eq("source_file_id", fileId).eq("status", "proposed");
    let total = 0;
    const touched: string[] = [];
    for (const p of out.phan_cong ?? []) {
      const m = open.find((x) => x.week_from === p.tuan) ?? open.find((x) => x.week_from != null && x.week_to != null && p.tuan >= x.week_from && p.tuan <= x.week_to);
      if (!m || !p.viec?.length) continue;
      const { data: sec } = await g.supabase.from("shcm_sections").select("id").eq("meeting_id", m.id).eq("key", "nhiem_vu").maybeSingle();
      if (!sec) continue;
      const body = p.viec.map((v) => `- ${v}`).join("\n").slice(0, 8000);
      const { error } = await g.supabase.from("shcm_entries").insert({ section_id: sec.id, author_id: g.profile.id, body, source: "ke_hoach", source_file_id: fileId, status: "proposed" });
      if (!error) { total += p.viec.length; touched.push(m.title); }
    }
    await g.supabase.from("shcm_files").update({ applied_at: new Date().toISOString(), applied_scope: "ke_hoach_nam" }).eq("id", fileId);
    return Response.json({ ok: true, total, meetings: touched.length });
  } catch (e) {
    return errorResponse(e);
  }
}
