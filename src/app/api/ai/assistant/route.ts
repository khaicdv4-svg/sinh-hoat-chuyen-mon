import { aiGuard, askTool, errorResponse, SYSTEM_BASE, withSkill, AiError } from "@/lib/ai";
import { buildContext } from "@/lib/ai-context";
import { loadSourcesText } from "@/lib/ai-sources";
import { fmtDate, fmtTime, fmtWeekday, memberName, partLabel, todayVN } from "@/lib/format";

export const maxDuration = 300;

type Out = {
  muc: { key: string; dong: string[] }[];
  thieu?: string[];
};

/** Giờ, thứ, ngày hiện tại theo giờ Việt Nam. */
function nowVN() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return { date: todayVN(), time };
}

const cleanLine = (s: string) => s.replace(/^[\s\-–—•*·]+/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/**
 * Trợ lý AI của tổ trưởng: hiểu thời điểm hiện tại, đọc các nguồn tư liệu của tổ,
 * rồi soạn nội dung cho nhiều mục của biên bản. Mỗi ý một dòng gạch đầu dòng.
 * Kết quả chỉ là đề xuất (khung tím), tổ trưởng xem và bấm nhận.
 */
export async function POST(req: Request) {
  try {
    const { meetingId, instruction, scope, modelId } = (await req.json()) as {
      meetingId?: string; instruction?: string; scope?: "empty" | "all"; modelId?: string;
    };
    if (!meetingId) throw new AiError("Thiếu biên bản.");
    const g = await aiGuard({ leaderOnly: true });
    // Dùng đúng model tổ trưởng chọn ở đầu biên bản cho lần này
    if (modelId && g.ai.models.some((m) => m.id === modelId)) g.ai = { ...g.ai, defaultId: modelId, routes: {} };

    const sb = g.supabase;
    const { data: meeting } = await sb.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
    if (!meeting) throw new AiError("Không tìm thấy biên bản.", 404);
    if (meeting.status === "locked") throw new AiError("Biên bản đã khóa.", 409);

    const [{ data: secs }, { data: roster }, { data: att }, { data: cal }] = await Promise.all([
      sb.from("shcm_sections").select("id, key, title, hint, part, position, layout, entry_editors, allow_opinions").eq("meeting_id", meetingId).order("position"),
      sb.from("shcm_members").select("id, honorific, full_name, active"),
      sb.from("shcm_attendance").select("member_id, present, reason").eq("meeting_id", meetingId),
      sb.from("shcm_calendar").select("week_no, week_start, note").order("week_no"),
    ]);
    const sections = secs ?? [];
    if (!sections.length) throw new AiError("Biên bản chưa có đề mục nào để viết.", 400);

    // Mục nào đã có nội dung đã nhận
    const ids = sections.map((s) => s.id);
    const { data: ents } = await sb.from("shcm_entries").select("section_id, status").in("section_id", ids);
    const filled = new Set((ents ?? []).filter((e) => e.status === "accepted" || e.status === "merged").map((e) => e.section_id));
    const targets = sections.filter((s) => (scope === "all" ? true : !filled.has(s.id)));
    if (!targets.length) throw new AiError("Các mục đều đã có nội dung. Chọn \"Cả các mục đã có nội dung\" nếu thầy muốn AI bổ sung thêm.", 409);

    // Thời điểm hiện tại
    const now = nowVN();
    const curWeek = [...(cal ?? [])].reverse().find((c) => c.week_start <= now.date);
    let when = "chưa định ngày họp";
    if (meeting.meeting_date) {
      when = meeting.meeting_date < now.date ? "đã diễn ra" : meeting.meeting_date === now.date ? "diễn ra hôm nay" : "chưa diễn ra (sắp họp)";
    }
    const members = (roster ?? []).filter((m) => m.active !== false);
    const absent = (att ?? []).filter((a) => !a.present).map((a) => {
      const m = members.find((x) => x.id === a.member_id);
      return `${m ? memberName(m) : "?"}${a.reason ? ` (${a.reason})` : ""}`;
    });
    const timeBlock = [
      `Bây giờ là ${now.time}, ${fmtWeekday(now.date)} ngày ${fmtDate(now.date)} (giờ Việt Nam).`,
      curWeek ? `Hôm nay thuộc tuần học thứ ${curWeek.week_no} của năm học.${curWeek.note ? ` Ghi chú lịch tuần này: ${curWeek.note}` : ""}` : "",
      meeting.meeting_date
        ? `Buổi sinh hoạt: ${fmtWeekday(meeting.meeting_date)} ${fmtDate(meeting.meeting_date)}${meeting.meeting_time ? `, ${fmtTime(meeting.meeting_time)}` : ""}${meeting.place ? `, tại ${meeting.place}` : ""}. Buổi họp này ${when}.`
        : "Buổi họp chưa có ngày.",
      (att ?? []).length ? `Điểm danh: có mặt ${members.length - absent.length}/${members.length}${absent.length ? `; vắng: ${absent.join("; ")}` : ""}.` : "Chưa điểm danh.",
    ].filter(Boolean).join("\n");

    const ctx = await buildContext(g, { meetingId, entries: "all", maxChars: 14000 });
    const sources = await loadSourcesText(g, 40000);

    const sectionList = targets
      .map((s) => {
        const who = s.entry_editors === "all" && s.allow_opinions ? "ý kiến của từng thành viên" : s.entry_editors === "leader" ? "tổ trưởng ghi" : "nội dung chung";
        return `- key "${s.key}": ${partLabel(s.part, meeting.week_from, meeting.week_to) || "(không thuộc phần nào)"} › ${s.title}${s.hint ? ` — mục đích: ${s.hint}` : ""} [${who}${filled.has(s.id) ? "; đã có nội dung, chỉ bổ sung điều còn thiếu" : "; đang trống"}]`;
      })
      .join("\n");

    const request = instruction?.trim() ? instruction.trim().slice(0, 2500) : "Viết các mục còn trống của biên bản này cho đầy đủ, đúng việc của tổ trong thời điểm này.";

    const out = await askTool<Out>(
      g, "tro_ly_bien_ban",
      withSkill(g, `${SYSTEM_BASE}
Bạn là trợ lý viết biên bản cho tổ trưởng. Tổ trưởng yêu cầu, bạn soạn nội dung vào các mục của biên bản.

Cách làm việc:
- Tự xác định thời điểm từ [Thời điểm hiện tại]. Buổi họp đã diễn ra thì ghi như việc đã làm. Buổi họp chưa diễn ra thì chỉ soạn phần chuẩn bị: chương trình, nhiệm vụ, văn bản cần triển khai, dự kiến. Tuyệt đối không viết như thể buổi họp đã xảy ra.
- Lấy thông tin từ [Bối cảnh buổi họp] và [Nguồn tư liệu của tổ] (kế hoạch, văn bản, lịch, Drive). Chỉ dùng điều có trong đó. Thiếu thì không viết, đưa vào "thieu" để tổ trưởng bổ sung.
- Mục ghi ý kiến của từng thành viên: không bịa lời của ai. Chỉ viết khi ý kiến đã có sẵn trong dữ liệu. Nếu không có thì bỏ qua mục đó và nêu vào "thieu".
- Không lặp lại điều đã ghi ở mục khác. Mục đã có nội dung thì chỉ bổ sung điều còn thiếu, không viết lại.

Cách viết:
- Mỗi nội dung một dòng riêng, là một mảng "dong" (ứng dụng sẽ tự thêm gạch đầu dòng, đừng tự gõ "-" hay số thứ tự).
- Câu ngắn, rõ chủ ngữ, giọng một giáo viên viết biên bản cho đồng nghiệp đọc. Đủ ý, không rườm.
- Không văn máy: không mở bài chào hỏi, không câu tổng kết sáo, không "đóng vai trò quan trọng", "không chỉ… mà còn", không liệt kê ba ý cho đẹp, không từ hoa mĩ, không in đậm, không biểu tượng.
- Tên người viết đúng như trong danh sách tổ. Ngày tháng, số liệu chép đúng nguồn.
- Mỗi mục thường 2 đến 6 dòng. Chỉ viết mục có căn cứ; mục không có gì để viết thì không đưa vào kết quả.`),
      [{
        type: "text",
        text: `[Thời điểm hiện tại]\n${timeBlock}\n\n[Bối cảnh buổi họp]\n${ctx}\n\n[Nguồn tư liệu của tổ]\n${sources || "(chưa có nguồn nào được bật)"}\n\n[Các mục có thể viết]\n${sectionList}\n\n[Yêu cầu của tổ trưởng]\n${request}`,
      }],
      {
        name: "soan_bien_ban",
        description: "Nội dung soạn cho các mục của biên bản, mỗi ý một dòng",
        input_schema: {
          type: "object",
          properties: {
            muc: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", description: "key của mục, đúng như trong danh sách" },
                  dong: { type: "array", items: { type: "string" }, description: "Các dòng nội dung, không kèm gạch đầu dòng" },
                },
                required: ["key", "dong"],
              },
            },
            thieu: { type: "array", items: { type: "string" }, description: "Thông tin còn thiếu mà tổ trưởng cần bổ sung hoặc cung cấp nguồn" },
          },
          required: ["muc"],
        },
      },
      8000,
    );

    const byKey = new Map(targets.map((s) => [s.key, s]));
    let sectionsDone = 0;
    let lines = 0;
    for (const m of out.muc ?? []) {
      const s = byKey.get(m.key);
      const items = (m.dong ?? []).map(cleanLine).filter((x) => x && !/^[.…\s]+$/.test(x));
      if (!s || !items.length) continue;
      const body = (s.layout === "inline" ? items.join(" ") : items.map((x) => `- ${x}`).join("\n")).slice(0, 8000);
      await sb.from("shcm_entries").delete().eq("section_id", s.id).eq("status", "proposed").eq("source", "ai_summary").eq("author_id", g.profile.id);
      const { error } = await sb.from("shcm_entries").insert({
        section_id: s.id, author_id: g.profile.id, body, source: "ai_summary", status: "proposed", kind: "noi_dung",
      });
      if (!error) { sectionsDone++; lines += items.length; }
    }
    if (!sectionsDone) throw new AiError("AI chưa tìm được nội dung có căn cứ để viết. Thầy bổ sung nguồn ở mục Nguồn tư liệu hoặc nêu rõ hơn yêu cầu.", 422);

    return Response.json({ ok: true, sections: sectionsDone, lines, missing: (out.thieu ?? []).map(cleanLine).filter(Boolean).slice(0, 12) });
  } catch (e) {
    return errorResponse(e);
  }
}
