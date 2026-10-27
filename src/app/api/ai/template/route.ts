import { aiGuard, askTool, errorResponse, fileToBlocks, SYSTEM_BASE, AiError, type Block } from "@/lib/ai";
import type { TemplateSection } from "@/lib/types";

export const maxDuration = 120;

/** Tổ trưởng mô tả hoặc đưa mẫu → AI đề xuất danh sách đề mục cho biên bản mới. */
export async function POST(req: Request) {
  try {
    const { description, fileId } = (await req.json()) as { description?: string; fileId?: string };
    const desc = (description ?? "").trim();
    if (!desc && !fileId) throw new AiError("Bạn mô tả biên bản cần thêm hoặc tải mẫu lên.");
    const g = await aiGuard({ leaderOnly: true });

    const content: Block[] = [];
    if (fileId) {
      const { data: f } = await g.supabase.from("shcm_files").select("*").eq("id", fileId).eq("kind", "mau_bien_ban").maybeSingle();
      if (!f) throw new AiError("Không tìm thấy tệp mẫu.", 404);
      content.push(...(await fileToBlocks(g, f.storage_path, f.file_name, f.mime_type)));
    }
    content.push({ type: "text", text: desc ? `Mô tả của tổ trưởng: ${desc}` : "Dựng đề mục theo mẫu đính kèm." });

    const out = await askTool<{ ten: string; muc: Omit<TemplateSection, "position">[] }>(
      g, "mau_bien_ban",
      `${SYSTEM_BASE}
Nhiệm vụ: thiết kế các đề mục cho một biên bản họp của tổ. Từ 3 đến 9 đề mục, theo đúng thứ tự diễn ra buổi họp.
Với mỗi đề mục chọn:
- entry_editors: ai ghi ý kiến (all = mọi thành viên, leader = chỉ tổ trưởng, assigned = người được phân công).
- files_mode: none, evidence (minh chứng: tệp, ảnh, clip) hoặc viewer (tệp để cả tổ xem và góp ý, như đề, kế hoạch).
- file_editors: ai tải tệp lên.
- ai_action: none, tom_tat_gop_y, gom_y_kien, tong_hop_ket_qua, du_thao_giai_phap hoặc du_thao_ket_luan.
Mục kết luận của tổ trưởng: entry_editors = leader, ai_action = du_thao_ket_luan. key viết không dấu, chữ thường, nối bằng gạch dưới.`,
      content,
      {
        name: "de_xuat_bien_ban",
        description: "Danh sách đề mục cho biên bản mới",
        input_schema: {
          type: "object",
          properties: {
            ten: { type: "string", description: "Tên biên bản gợi ý" },
            muc: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  title: { type: "string" },
                  hint: { type: "string" },
                  entry_editors: { type: "string", enum: ["all", "leader", "assigned"] },
                  file_editors: { type: "string", enum: ["all", "leader", "assigned"] },
                  files_mode: { type: "string", enum: ["none", "evidence", "viewer"] },
                  file_label: { type: "string" },
                  ai_action: { type: "string", enum: ["none", "tom_tat_gop_y", "gom_y_kien", "tong_hop_ket_qua", "du_thao_giai_phap", "du_thao_ket_luan"] },
                },
                required: ["key", "title", "entry_editors", "file_editors", "files_mode", "ai_action"],
              },
            },
          },
          required: ["ten", "muc"],
        },
      },
      4000,
    );
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
