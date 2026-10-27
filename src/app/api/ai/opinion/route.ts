import { aiGuard, askText, errorResponse, SYSTEM_BASE, AiError } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sectionId, text } = (await req.json()) as { sectionId?: string; text?: string };
    const draft = (text ?? "").trim();
    if (!draft) throw new AiError("Bạn viết ý kiến trước, AI mới hỗ trợ hoàn chỉnh được.", 400);
    if (draft.length > 6000) throw new AiError("Ý kiến dài quá, bạn rút gọn dưới 6000 ký tự.", 400);
    const g = await aiGuard({ leaderOnly: false });

    let ctx = "";
    if (sectionId) {
      const { data: s } = await g.supabase.from("shcm_sections").select("title, hint, meeting:meeting_id(title, topic)").eq("id", sectionId).maybeSingle();
      if (s) {
        const m = s.meeting as unknown as { title: string; topic: string | null } | null;
        ctx = `Biên bản: ${m?.title ?? ""}${m?.topic ? ` (${m.topic})` : ""}\nĐề mục: ${s.title}\n`;
      }
    }
    const out = await askText(
      g, "y_kien",
      `${SYSTEM_BASE}
Nhiệm vụ: giúp một giáo viên hoàn chỉnh ý kiến của chính họ.
- Giữ nguyên ý và quan điểm của giáo viên, không thêm ý mới, không thêm số liệu hay ví dụ họ chưa nêu.
- Sửa cho rõ ràng, mạch lạc, đúng chính tả, giọng tự nhiên của người trong tổ.
- Nếu ý kiến nhận xét giờ dạy, hướng về việc học của học sinh, không nhận xét cá nhân người dạy.
- Độ dài gần với bản gốc, không phô trương.
- Chỉ trả về đúng đoạn ý kiến đã hoàn chỉnh, không giải thích, không đặt trong ngoặc kép.`,
      `${ctx}\nÝ kiến của giáo viên:\n${draft}`,
      1200,
    );
    return Response.json({ text: out });
  } catch (e) {
    return errorResponse(e);
  }
}
