import { FORMS_RULE, loadFormsText } from "@/lib/ai-sources";
import { aiGuard, askText, errorResponse, fileToBlocks, SYSTEM_BASE, withSkill, AiError, type Block } from "@/lib/ai";
import { buildContext } from "@/lib/ai-context";

export const maxDuration = 120;

const TASKS: Record<string, string> = {
  tom_tat_gop_y:
    "Tóm tắt các góp ý của giáo viên thành danh sách ngắn những điểm cần chỉnh sửa hoặc giữ lại. Mỗi điểm một dòng bắt đầu bằng gạch đầu dòng, ghi rõ ai nêu (theo họ tên trong dữ liệu) nếu có. Gộp các ý trùng nhau. Không thêm ý mới.",
  gom_y_kien:
    "Gom và phân nhóm ý kiến thảo luận. Chia thành các nhóm ngắn có tiêu đề (ví dụ: điều quan sát được ở học sinh, điểm làm tốt, điểm cần điều chỉnh, đề xuất). Dưới mỗi nhóm là các gạch đầu dòng, ghi tên người nêu. Không đánh giá, không xếp loại người dạy.",
  tong_hop_ket_qua:
    "Tổng hợp kết quả vận dụng mà các giáo viên báo cáo: ai áp dụng ở lớp nào, kết quả quan sát được, khó khăn còn lại. Viết ngắn theo từng gạch đầu dòng, ghi tên người báo cáo.",
  du_thao_giai_phap:
    "Soạn dự thảo nội dung tổ thống nhất dựa trên các ý kiến đã ghi: những điều thống nhất, ai làm, hạn hoàn thành nếu dữ liệu có nói. Điều nào chưa ai nêu người làm hoặc hạn thì ghi 'chưa phân công' hoặc 'chưa định hạn', không tự đặt.",
  du_thao_ket_luan:
    "Soạn dự thảo kết luận của tổ trưởng cho buổi sinh hoạt này, dựa trên toàn bộ nội dung các đề mục: 1) những việc đã làm được, 2) những điều tổ thống nhất, 3) việc tiếp theo, người phụ trách và thời hạn nếu có trong dữ liệu. Viết thành vài đoạn ngắn hoặc gạch đầu dòng, giọng của tổ trưởng nói với tổ.",
};

export async function POST(req: Request) {
  try {
    const { sectionId } = (await req.json()) as { sectionId?: string };
    if (!sectionId) throw new AiError("Thiếu đề mục.");
    const g = await aiGuard({ leaderOnly: true });

    const { data: sec } = await g.supabase.from("shcm_sections").select("*, meeting:meeting_id(id, title, topic, status)").eq("id", sectionId).maybeSingle();
    if (!sec) throw new AiError("Không tìm thấy đề mục.", 404);
    const meeting = sec.meeting as unknown as { id: string; title: string; topic: string | null; status: string };
    if (meeting.status === "locked") throw new AiError("Biên bản đã khóa.", 409);
    const task = TASKS[sec.ai_action as string];
    if (!task) throw new AiError("Đề mục này không có chức năng AI.");

    const lines: string[] = [`Biên bản: ${meeting.title}${meeting.topic ? ` (${meeting.topic})` : ""}`];
    const secIds: string[] = [sec.id];
    let sectionList = [sec];
    if (sec.ai_action === "du_thao_ket_luan") {
      const { data: all } = await g.supabase.from("shcm_sections").select("*").eq("meeting_id", meeting.id).order("position");
      sectionList = (all ?? []).filter((s) => s.id !== sec.id);
      secIds.splice(0, secIds.length, ...sectionList.map((s) => s.id));
    }
    const { data: ents } = secIds.length
      ? await g.supabase.from("shcm_entries").select("section_id, body, created_at, speaker_id, author:author_id(full_name, email)").in("section_id", secIds).in("status", ["accepted", "merged"]).order("created_at")
      : { data: [] };
    const { data: roster } = await g.supabase.from("shcm_members").select("id, honorific, full_name");
    const speakerName = (id: string | null) => {
      const m = (roster ?? []).find((x) => x.id === id);
      return m ? `${m.honorific} ${m.full_name}` : "";
    };
    for (const s of sectionList) {
      lines.push(`\n## ${s.title}`);
      const mine = (ents ?? []).filter((e) => e.section_id === s.id);
      if (!mine.length) lines.push("(chưa có ý kiến)");
      for (const e of mine) {
        const a = e.author as unknown as { full_name: string | null; email: string } | null;
        const sp = speakerName(e.speaker_id);
        lines.push(sp ? `- ${sp}: ${e.body}` : `- (nội dung chung, ${a?.full_name || a?.email || "không rõ"} ghi): ${e.body}`);
      }
    }
    if (sec.ai_action !== "du_thao_ket_luan" && !(ents ?? []).length) throw new AiError("Đề mục chưa có ý kiến nào để AI tổng hợp.", 400);

    const blocks: Block[] = [];
    if (sec.files_mode === "viewer") {
      const { data: f } = await g.supabase.from("shcm_files").select("storage_path, file_name, mime_type").eq("section_id", sec.id).eq("kind", "minh_chung").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (f) {
        try { blocks.push(...(await fileToBlocks(g, f.storage_path, f.file_name, f.mime_type))); } catch { /* bỏ qua tệp AI không đọc được */ }
      }
    }
    const ctx = await buildContext(g, { meetingId: meeting.id, sectionId: sec.id, entries: "none", maxChars: 5000 });
    const forms = await loadFormsText(g, 10000);
    blocks.push({ type: "text", text: `[Bối cảnh]\n${ctx}\n\n${forms ? `[Biểu mẫu của tổ]\n${forms}\n\n` : ""}[Nội dung cần xử lý]\n${lines.join("\n")}` });

    const out = await askText(g, sec.ai_action, withSkill(g, `${SYSTEM_BASE}\n${FORMS_RULE}\nNhiệm vụ: ${task}\nChỉ trả về nội dung dự thảo, không lời dẫn, không giải thích. Đây chỉ là dự thảo để tổ trưởng xem và sửa.`), blocks, 2000);
    if (!out) throw new AiError("AI chưa soạn được, thử lại giúp.", 502);

    // Dự thảo cũ chưa nhận thì thay bằng bản mới
    await g.supabase.from("shcm_entries").delete().eq("section_id", sec.id).eq("status", "proposed").eq("source", "ai_summary");
    const { error } = await g.supabase.from("shcm_entries").insert({ section_id: sec.id, author_id: g.profile.id, body: out.slice(0, 8000), source: "ai_summary", status: "proposed" });
    if (error) throw new AiError("Không lưu được dự thảo: " + error.message, 500);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
