import { aiGuard, askText, errorResponse, AiError } from "@/lib/ai";
import { buildContext } from "@/lib/ai-context";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sectionId, text, speakerId } = (await req.json()) as { sectionId?: string; text?: string; speakerId?: string | null };
    const draft = (text ?? "").trim();
    if (!draft) throw new AiError("Bạn viết ý kiến trước, AI mới hỗ trợ hoàn chỉnh được.", 400);
    if (draft.length > 6000) throw new AiError("Ý kiến dài quá, bạn rút gọn dưới 6000 ký tự.", 400);
    const g = await aiGuard({ leaderOnly: false });

    let ctx = "";
    if (sectionId) {
      const { data: s } = await g.supabase.from("shcm_sections").select("meeting_id").eq("id", sectionId).maybeSingle();
      if (s?.meeting_id) {
        const { data: me } = await g.supabase.from("shcm_members").select("id").eq("user_id", g.profile.id).maybeSingle();
        ctx = await buildContext(g, { meetingId: s.meeting_id, sectionId, speakerId: speakerId || me?.id || null, entries: "all", maxChars: 8000 });
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
- Phần "Bối cảnh" chỉ để bạn hiểu: môn, bài, thuật ngữ, việc đã bàn trước đó, mục đích của mục đang ghi. Dùng nó để hiểu đúng ý giáo viên và để câu chữ ăn khớp với những gì đã ghi. Không chép thông tin từ bối cảnh vào ý kiến nếu giáo viên không nói.
- Khi giáo viên nhắc tên đồng nghiệp (cô/thầy + tên) mà trong danh sách thành viên có tên trùng hoặc gần giống, viết đúng họ tên theo danh sách. Không có trong danh sách thì giữ nguyên.
- Nếu ý kiến có nhiều ý, sắp theo mạch hợp với mục đích của mục (ví dụ quan sát được, nguyên nhân, đề xuất), nhưng không thêm ý.
- Nếu ý kiến rất ngắn, chỉ sửa thành câu đủ ý, không kéo dài.
- Giọng giáo viên viết cho đồng nghiệp: giản dị, không sáo rỗng, không văn máy.
- Chỉ trả về đúng đoạn ý kiến đã chỉnh. Không lời dẫn, không giải thích, không ngoặc kép, không gạch đầu dòng.

Ví dụ:
Ý kiến: phương pháp cũng ổn, học sinh chưa họp tác lắm
Kết quả: Phương pháp dạy tương đối phù hợp, tuy nhiên học sinh chưa hợp tác tốt.

Ý kiến: kiểm tra GHKI, chấm và nhập điểm
Kết quả: Đã tổ chức kiểm tra GHKI, chấm bài và nhập điểm.`,
      `[Bối cảnh]\n${ctx}\n\n[Ý kiến thô của giáo viên cần chỉnh]\n${draft}`,
      1200,
    );
    return Response.json({ text: out });
  } catch (e) {
    return errorResponse(e);
  }
}
