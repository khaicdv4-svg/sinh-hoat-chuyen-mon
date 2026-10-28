import { aiGuard, askText, errorResponse, fileToBlocks, SYSTEM_BASE, withSkill, AiError, type Block } from "@/lib/ai";
import { buildContext } from "@/lib/ai-context";
import { loadSourcesText } from "@/lib/ai-sources";

export const maxDuration = 120;

/**
 * Tổ trưởng nhờ AI viết nội dung cho một mục (mode "write"),
 * hoặc lấy phần thuộc mục này từ một tệp đã tải (mode "import"). Kết quả ở dạng đề xuất, chờ tổ trưởng nhận.
 */
export async function POST(req: Request) {
  try {
    const { sectionId, mode, instruction, fileId } = (await req.json()) as {
      sectionId?: string; mode?: "write" | "import"; instruction?: string; fileId?: string;
    };
    if (!sectionId || (mode !== "write" && mode !== "import")) throw new AiError("Thiếu thông tin.");
    const g = await aiGuard({ leaderOnly: true });

    const { data: sec } = await g.supabase.from("shcm_sections").select("*, meeting:meeting_id(id, title, topic, status, week_from, week_to)").eq("id", sectionId).maybeSingle();
    if (!sec) throw new AiError("Không tìm thấy đề mục.", 404);
    const meeting = sec.meeting as unknown as { id: string; title: string; topic: string | null; status: string };
    if (meeting.status === "locked") throw new AiError("Biên bản đã khóa.", 409);

    const ctx = await buildContext(g, { meetingId: meeting.id, sectionId: sec.id, entries: "all", maxChars: 9000 });
    const target = `Mục cần viết: "${sec.title}"${sec.hint ? `\nMục đích của mục: ${sec.hint}` : ""}`;
    let out: string;

    if (mode === "write") {
      const sources = await loadSourcesText(g);
      const note = instruction?.trim() ? `\nYêu cầu của tổ trưởng: ${instruction.trim().slice(0, 1500)}` : "";
      const content: Block[] = [{
        type: "text",
        text: `[Bối cảnh buổi họp]\n${ctx}\n\n${sources ? `[Nguồn tư liệu của tổ]\n${sources}\n\n` : "[Nguồn tư liệu của tổ]\n(chưa có nguồn nào được bật)\n\n"}${target}${note}`,
      }];
      out = await askText(
        g, "viet_noi_dung",
        withSkill(g, `${SYSTEM_BASE}
Nhiệm vụ: viết nội dung cho đúng mục được nêu của biên bản, như tổ trưởng ghi lại.
- Dựa vào [Bối cảnh buổi họp] và [Nguồn tư liệu của tổ]. Điều gì không có trong dữ liệu thì không viết, hoặc ghi rõ "chưa có" để tổ trưởng bổ sung.
- Không lặp lại những gì đã ghi ở các mục khác. Không viết tên mục ở đầu. Không lời dẫn, không giải thích.
- Ngắn gọn, đúng việc của tổ. Đây là bản nháp để tổ trưởng xem và sửa.`),
        content, 2500,
      );
    } else {
      if (!fileId) throw new AiError("Thiếu tệp.");
      const { data: file } = await g.supabase.from("shcm_files").select("*").eq("id", fileId).maybeSingle();
      if (!file) throw new AiError("Không tìm thấy tệp.", 404);
      const doc = await fileToBlocks(g, file.storage_path, file.file_name, file.mime_type);
      out = await askText(
        g, "nhap_bien_ban",
        `${SYSTEM_BASE}
Nhiệm vụ: trong tệp được đưa, tìm phần nội dung thuộc về mục được nêu và chép lại.
- Giữ nguyên câu chữ, không viết lại, không tóm tắt, không thêm ý. Bỏ số thứ tự và tên mục ở đầu đoạn.
- Bỏ những chỗ chỉ có dấu chấm để trống.
- Chỉ lấy phần thuộc mục này. Nếu tệp không có phần nào hợp với mục, trả lời đúng một dòng: KHÔNG CÓ`,
        [...doc, { type: "text", text: `${target}` }], 4000,
      );
      if (/^KHÔNG CÓ\.?$/i.test(out.trim())) throw new AiError("Tệp này không có phần nào thuộc mục này.", 422);
    }
    if (!out) throw new AiError("AI chưa soạn được, thử lại giúp.", 502);

    await g.supabase.from("shcm_entries").delete().eq("section_id", sec.id).eq("status", "proposed").eq("source", mode === "write" ? "ai_summary" : "nhap_file").eq("author_id", g.profile.id);
    const { error } = await g.supabase.from("shcm_entries").insert({
      section_id: sec.id, author_id: g.profile.id, body: out.slice(0, 8000), source: mode === "write" ? "ai_summary" : "nhap_file",
      status: "proposed", kind: "noi_dung", source_file_id: mode === "import" ? fileId : null,
    });
    if (error) throw new AiError("Không lưu được bản nháp: " + error.message, 500);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
