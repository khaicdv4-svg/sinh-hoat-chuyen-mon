import { aiGuard, askTool, errorResponse, SYSTEM_BASE, withSkill, AiError } from "@/lib/ai";
import { buildContext } from "@/lib/ai-context";
import { loadSourcesText } from "@/lib/ai-sources";
import { memberName, partLabel } from "@/lib/format";
import { isOpinionPart, stripMarks } from "@/lib/markers";

export const maxDuration = 300;

type Out = { y_kien: { member_id: string; noi_dung: string }[] };

const clean = (s: string) => stripMarks(s.replace(/\*\*/g, "")).replace(/^["“”\s\-–•]+|["“”\s]+$/g, "").replace(/[ \t]+/g, " ").trim();

/**
 * Tổ trưởng nhờ AI viết ý kiến thay các thành viên chưa gửi, ở cuối một mục lớn (I–IV).
 * Ý kiến vào trạng thái "chờ tổ trưởng xem" (khung vàng), tổ trưởng đọc, sửa rồi mới ghi nhận vào biên bản.
 * Cách viết theo kỹ năng viết biên bản NCBH của tổ trưởng (Cài đặt AI) và nguồn tư liệu (kế hoạch, KHBD).
 */
export async function POST(req: Request) {
  try {
    const { meetingId, part, memberIds, modelId, note } = (await req.json()) as {
      meetingId?: string; part?: string; memberIds?: string[]; modelId?: string; note?: string;
    };
    if (!meetingId || !part || !isOpinionPart(part)) throw new AiError("Thiếu biên bản hoặc mục.");
    if (!memberIds?.length) throw new AiError("Thầy chọn ít nhất một thành viên.");
    const g = await aiGuard({ leaderOnly: true });
    if (modelId && g.ai.models.some((m) => m.id === modelId)) g.ai = { ...g.ai, defaultId: modelId, routes: {} };
    const sb = g.supabase;

    const { data: meeting } = await sb.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
    if (!meeting) throw new AiError("Không tìm thấy biên bản.", 404);
    if (meeting.status === "locked") throw new AiError("Biên bản đã khóa.", 409);

    const [{ data: secs }, { data: roster }] = await Promise.all([
      sb.from("shcm_sections").select("id, key, title, hint, part, position, allow_opinions").eq("meeting_id", meetingId).eq("part", part).order("position"),
      sb.from("shcm_members").select("id, honorific, full_name, title, active").order("sort_order"),
    ]);
    const sections = secs ?? [];
    if (!sections.length) throw new AiError("Mục này chưa có đề mục nào.", 400);
    const target = [...sections].reverse().find((s) => s.allow_opinions) ?? sections[sections.length - 1];
    const who = (roster ?? []).filter((m) => memberIds.includes(m.id) && m.active !== false);
    if (!who.length) throw new AiError("Không tìm thấy thành viên đã chọn.");

    // Nội dung của mục lớn và các ý kiến đã có (để không lặp ý)
    const { data: ents } = await sb.from("shcm_entries")
      .select("section_id, body, speaker_id, kind, status").in("section_id", sections.map((s) => s.id)).order("created_at");
    const nameOf = (id: string | null) => {
      const m = (roster ?? []).find((x) => x.id === id);
      return m ? memberName(m) : "";
    };
    const partText = sections.map((s) => {
      const lines = (ents ?? []).filter((e) => e.section_id === s.id && e.kind === "noi_dung" && (e.status === "accepted" || e.status === "proposed"))
        .map((e) => `${nameOf(e.speaker_id) ? nameOf(e.speaker_id) + ": " : ""}${stripMarks(e.body)}`).filter(Boolean);
      return `- ${s.title}${s.hint ? ` (mục đích: ${s.hint})` : ""}\n${lines.join("\n") || "(chưa ghi nội dung)"}`;
    }).join("\n");
    const had = (ents ?? []).filter((e) => e.kind === "y_kien" && ["accepted", "pending", "merged"].includes(e.status))
      .map((e) => `- ${nameOf(e.speaker_id) || "Thành viên"}: ${e.body}`);
    const ncbh = sections.some((s) => /^ncbh_/.test(s.key) || /nghiên cứu bài học/i.test(s.title));

    const ctx = await buildContext(g, { meetingId, entries: "all", maxChars: 9000 });
    const sources = await loadSourcesText(g, 36000);
    const label = partLabel(part, meeting.week_from, meeting.week_to);
    const list = who.map((m) => `- member_id "${m.id}": ${memberName(m)}${m.title ? ` (${m.title})` : ""}`).join("\n");

    const out = await askTool<Out>(
      g, "y_kien_thay",
      withSkill(g, `${SYSTEM_BASE}

Việc của bạn: tổ trưởng sắp xuất biên bản nhưng một số thành viên chưa gửi ý kiến ở mục "${label}". Bạn viết ý kiến thay cho từng thành viên trong danh sách, để tổ trưởng đọc, sửa rồi mới ghi vào biên bản.

Cách viết ý kiến:
- Mỗi thành viên một ý kiến riêng, 2 đến 4 câu, bám đúng nội dung đã ghi của mục và giai đoạn buổi họp. Các ý kiến không lặp câu, không lặp ý của nhau và của các ý kiến đã có; mỗi người nhìn từ lớp mình dạy và vai trò của mình (GVCN lớp nào, giáo viên bộ môn, tổ phó…).
- Viết như lời phát biểu được ghi vào biên bản: câu trần thuật ngắn, không xưng "tôi/em", không ghi tên người ở đầu (ứng dụng tự ghi tên), không mở bài, không khen sáo, không "đóng vai trò quan trọng", "không chỉ… mà còn", không liệt kê ba ý cho đẹp.
- Không bịa số liệu, tỉ lệ, tên học sinh, kết quả chưa có trong dữ liệu. Không để ghi chú [Cần bổ sung] hay chỗ chấm trống trong ý kiến: thiếu số liệu thì nói khái quát đúng sự việc.
${ncbh ? `- Đây là phần nghiên cứu bài học${meeting.ncbh_stage ? `, giai đoạn đang thực hiện: ${meeting.ncbh_stage}` : ""}. Viết đúng bước, không trộn nhận xét các bước:
  · Bước 1 (xây dựng bài học): góp ý kế hoạch bài dạy — yêu cầu cần đạt, hoạt động trọng tâm, câu hỏi, phiếu, đồ dùng, cách tổ chức cho học sinh, chỗ học sinh lớp mình dễ vướng.
  · Bước 2 (dạy minh họa, dự giờ): chỉ nêu điều quan sát được ở hoạt động học của học sinh khi dữ liệu có; không có thì góp ý chuẩn bị dự giờ, điều mình sẽ quan sát.
  · Bước 3 (phân tích bài học): đi theo mạch minh chứng ở học sinh → khó khăn, nguyên nhân → điều chỉnh đề xuất. Người dạy minh họa thì tự nhìn lại tiết dạy của mình.
  · Bước 4 (vận dụng): nêu việc đã áp dụng ở lớp mình khi dữ liệu có; chưa có báo cáo thì nêu việc sẽ áp dụng ở lớp mình và cách theo dõi, không tự nhận xét kết quả như "học sinh chủ động hơn".
  · Bàn về việc học của học sinh, không chấm điểm, không xếp loại giờ dạy của đồng nghiệp.
- Nếu trong [Nguồn tư liệu của tổ] (kế hoạch bài dạy) có phần "Ý kiến đóng góp theo nghiên cứu bài học" ghi ý kiến của đúng thành viên ở đúng bước, ưu tiên dùng ý đó: giữ ý, có thể rút gọn câu, không ghép ý người này sang người khác.` : "- Ý kiến góp ý cho nội dung của mục: bổ sung, đề xuất cách làm ở lớp mình, việc cần lưu ý; dựa trên những gì đã ghi trong mục và nguồn tư liệu."}`),
      [{
        type: "text",
        text: `[Bối cảnh buổi họp]\n${ctx}\n\n[Nguồn tư liệu của tổ]\n${sources || "(chưa có nguồn nào được bật)"}\n\n[Nội dung mục ${label}]\n${partText}\n\n[Ý kiến đã có, không lặp lại]\n${had.join("\n") || "(chưa có)"}\n\n[Thành viên cần viết ý kiến thay]\n${list}${note?.trim() ? `\n\n[Tổ trưởng dặn thêm]\n${note.trim().slice(0, 1500)}` : ""}`,
      }],
      {
        name: "y_kien_thanh_vien",
        description: "Ý kiến viết thay cho từng thành viên chưa gửi",
        input_schema: {
          type: "object",
          properties: {
            y_kien: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  member_id: { type: "string", description: "member_id đúng như danh sách" },
                  noi_dung: { type: "string", description: "Ý kiến 2–4 câu, không kèm tên người" },
                },
                required: ["member_id", "noi_dung"],
              },
            },
          },
          required: ["y_kien"],
        },
      },
      6000,
    );

    let added = 0;
    for (const y of out.y_kien ?? []) {
      const m = who.find((x) => x.id === y.member_id);
      const body = clean(y.noi_dung ?? "").replace(new RegExp(`^${m ? memberName(m) : "@@"}\\s*:\\s*`, "i"), "");
      if (!m || body.length < 5) continue;
      // Thay bản AI viết trước đó (nếu có) của cùng người ở mục này
      await sb.from("shcm_entries").delete().eq("section_id", target.id).eq("kind", "y_kien").eq("status", "pending")
        .eq("source", "ai_summary").eq("speaker_id", m.id);
      const { error } = await sb.from("shcm_entries").insert({
        section_id: target.id, author_id: g.profile.id, speaker_id: m.id, body: body.slice(0, 4000),
        source: "ai_summary", kind: "y_kien", status: "pending",
      });
      if (!error) added++;
    }
    if (!added) throw new AiError("AI chưa viết được ý kiến nào. Thầy thử lại hoặc chọn mô hình khác.", 422);
    return Response.json({ ok: true, added });
  } catch (e) {
    return errorResponse(e);
  }
}
