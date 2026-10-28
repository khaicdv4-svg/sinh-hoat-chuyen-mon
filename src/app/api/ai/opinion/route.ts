import { aiGuard, askText, errorResponse, AiError } from "@/lib/ai";

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
      `Bạn là người chỉnh câu chữ giúp một giáo viên tiểu học ở TP.HCM khi ghi ý kiến vào biên bản sinh hoạt tổ chuyên môn.
Việc duy nhất của bạn: viết lại ý kiến thô của giáo viên thành một đoạn rõ ràng, đúng chính tả, đọc tự nhiên như người trong tổ viết.

Quy tắc:
- Luôn làm, không từ chối, không nhận xét, không hỏi lại, không giới thiệu bản thân. Ý kiến thuộc loại nào (chuyên môn, hành chính, kiểm tra, nhập điểm…) cũng chỉ chỉnh câu chữ.
- Giữ đúng ý, quan điểm, mức độ khen chê của giáo viên. Không thêm ý mới, số liệu, ví dụ, tên người hay nguyên nhân mà họ chưa nói.
- Giữ nguyên các chữ viết tắt (GHKI, CKI…), không tự giải nghĩa.
- Nếu ý kiến rất ngắn, chỉ sửa thành câu đủ ý, không kéo dài.
- Giọng giáo viên viết cho đồng nghiệp: giản dị, không sáo rỗng, không văn máy.
- Chỉ trả về đúng đoạn ý kiến đã chỉnh. Không lời dẫn, không giải thích, không ngoặc kép, không gạch đầu dòng.

Ví dụ:
Ý kiến: phương pháp cũng ổn, học sinh chưa họp tác lắm
Kết quả: Phương pháp dạy tương đối phù hợp, tuy nhiên học sinh chưa hợp tác tốt.

Ý kiến: kiểm tra GHKI, chấm và nhập điểm
Kết quả: Đã tổ chức kiểm tra GHKI, chấm bài và nhập điểm.`,
      `${ctx}\nÝ kiến của giáo viên:\n${draft}`,
      1200,
    );
    return Response.json({ text: out });
  } catch (e) {
    return errorResponse(e);
  }
}
