import { aiGuard, askTool, errorResponse, withSkill, AiError } from "@/lib/ai";
import { buildContext } from "@/lib/ai-context";
import { FORMS_RULE, loadFormsText } from "@/lib/ai-sources";
import { memberName, partLabel } from "@/lib/format";
import { isOpinionPart, stripMarks } from "@/lib/markers";

export const maxDuration = 300;

type Out = { muc: { key: string; dong: string[] }[] };

const cleanLine = (s: string) => stripMarks(s.replace(/^[\s\-–—•*·]+/, "").replace(/\*\*/g, "")).replace(/\s+/g, " ").trim();

/**
 * "Hoàn chỉnh biên bản": AI rà soát toàn bộ nội dung (đã nhận và đề xuất chưa nhận) của từng mục,
 * viết lại thành bản hoàn chỉnh: không ghi chú thiếu thông tin, không chừa chỗ chấm, câu đủ ý, mỗi ý một dòng.
 * Nội dung cũ được giữ lại ở trạng thái ẩn để hoàn tác. Ý kiến của thành viên giữ nguyên lời.
 */
export async function POST(req: Request) {
  try {
    const { meetingId, modelId, undo } = (await req.json()) as { meetingId?: string; modelId?: string; undo?: boolean };
    if (!meetingId) throw new AiError("Thiếu biên bản.");
    const g = await aiGuard({ leaderOnly: true });
    if (modelId && g.ai.models.some((m) => m.id === modelId)) g.ai = { ...g.ai, defaultId: modelId, routes: {} };
    const sb = g.supabase;

    const { data: meeting } = await sb.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
    if (!meeting) throw new AiError("Không tìm thấy biên bản.", 404);
    if (meeting.status === "locked") throw new AiError("Biên bản đã khóa. Mở khóa rồi hoàn chỉnh lại.", 409);

    const { data: secs } = await sb.from("shcm_sections").select("id, key, title, hint, part, position, layout").eq("meeting_id", meetingId).order("position");
    const sections = secs ?? [];
    if (!sections.length) throw new AiError("Biên bản chưa có đề mục nào.", 400);
    const ids = sections.map((s) => s.id);
    const { data: entsRaw } = await sb.from("shcm_entries")
      .select("id, section_id, body, speaker_id, kind, status, source, created_at").in("section_id", ids).order("created_at");
    const ents = entsRaw ?? [];

    // ---------- Hoàn tác: trả lại nội dung cũ, bản hoàn chỉnh chuyển thành đề xuất (khung tím)
    if (undo) {
      const old = ents.filter((e) => e.kind === "noi_dung" && e.status === "dismissed").map((e) => e.id);
      const fin = ents.filter((e) => e.source === "hoan_chinh" && e.status === "accepted").map((e) => e.id);
      if (!fin.length && old.length) {
        // chưa chạy migration 008: bản hoàn chỉnh được ghi là ai_summary, nhận ra qua mục có nội dung cũ bị ẩn
        const secOld = new Set(ents.filter((e) => old.includes(e.id)).map((e) => e.section_id));
        fin.push(...ents.filter((e) => e.source === "ai_summary" && e.status === "accepted" && secOld.has(e.section_id) && e.kind === "noi_dung").map((e) => e.id));
      }
      if (old.length) await sb.from("shcm_entries").update({ status: "accepted" }).in("id", old);
      if (fin.length) await sb.from("shcm_entries").update({ status: "proposed" }).in("id", fin);
      await sb.from("shcm_meetings").update({ finalized_at: null }).eq("id", meetingId);
      return Response.json({ ok: true, undone: true });
    }

    const { data: roster } = await sb.from("shcm_members").select("id, honorific, full_name");
    const nameOf = (id: string | null) => {
      const m = (roster ?? []).find((x) => x.id === id);
      return m ? memberName(m) : "";
    };

    // Nội dung hiện có của từng mục
    const blocks: string[] = [];
    const work = new Map<string, { content: string[]; proposed: string[] }>();
    for (const s of sections) {
      const mine = ents.filter((e) => e.section_id === s.id);
      const content = mine.filter((e) => e.kind === "noi_dung" && e.status === "accepted")
        .map((e) => `${nameOf(e.speaker_id) ? nameOf(e.speaker_id) + ": " : ""}${e.body}`);
      const proposed = mine.filter((e) => e.kind === "noi_dung" && e.status === "proposed").map((e) => e.body);
      const merged = mine.filter((e) => e.kind === "y_kien" && e.status === "merged").map((e) => `${nameOf(e.speaker_id) || "Giáo viên"}: ${e.body}`);
      work.set(s.id, { content, proposed });
      const label = `${partLabel(s.part, meeting.week_from, meeting.week_to) || "(không thuộc phần nào)"} › ${s.title}`;
      blocks.push([
        `### key "${s.key}" — ${label}${s.hint ? ` (mục đích: ${s.hint})` : ""}`,
        content.length ? `Nội dung đã nhận:\n${content.join("\n")}` : "Nội dung đã nhận: (chưa có)",
        proposed.length ? `Bản đề xuất chưa nhận:\n${proposed.join("\n")}` : "",
        merged.length ? `Ý kiến đã bổ sung vào mục (giữ nguyên, KHÔNG chép lại):\n${merged.join("\n")}` : "",
      ].filter(Boolean).join("\n"));
    }
    // Ý kiến của thành viên ở cuối mỗi mục lớn: chỉ để AI hiểu, không viết lại
    const opinions = ents.filter((e) => e.kind === "y_kien" && e.status === "accepted").map((e) => {
      const s = sections.find((x) => x.id === e.section_id);
      return `- (${s && isOpinionPart(s.part) ? s.part!.split(".")[0] : s?.title}) ${nameOf(e.speaker_id) || "Thành viên"}: ${e.body}`;
    });

    const ctx = await buildContext(g, { meetingId, entries: "none", maxChars: 5000 });
    const forms = await loadFormsText(g);

    const out = await askTool<Out>(
      g, "hoan_chinh_bien_ban",
      withSkill(g, `Bạn là người rà soát, hoàn chỉnh biên bản sinh hoạt tổ chuyên môn khối 4 của một trường tiểu học ở TP.HCM trước khi in, ký.
${FORMS_RULE}
Việc của bạn: với TỪNG mục, đọc nội dung đã nhận và bản đề xuất chưa nhận, gộp lại thành nội dung hoàn chỉnh cuối cùng của mục đó.

Yêu cầu bản hoàn chỉnh:
- Tuyệt đối không còn ghi chú kiểu [Cần bổ sung: …], (thiếu thông tin), "chưa có", dấu ba chấm hay chuỗi "......" để chừa trống.
- Chỗ nào thiếu số liệu, tên, ngày: viết lại câu cho trọn ý mà không cần thông tin đó (nói khái quát đúng sự việc). Không bịa số liệu, tên người, ngày tháng, tên văn bản.
- Câu nào chỉ là ghi chú thiếu, không có nội dung thật thì bỏ. Mục chỉ toàn ghi chú: viết 1–2 dòng khái quát hợp với mục đích của mục và bối cảnh buổi họp (ví dụ việc tổ đã triển khai, thống nhất thực hiện), không nêu số cụ thể. Mục V viết kết luận: việc tổ thống nhất, ai phụ trách nếu dữ liệu có.
- Giữ đúng ý và sự việc đã ghi. Giữ tên người đúng như dữ liệu (Thầy/Cô + họ tên). Bỏ ý trùng lặp giữa nội dung đã nhận và bản đề xuất.
- Trình bày: mỗi ý chính một dòng (ứng dụng tự thêm gạch đầu dòng, bạn không gõ "-" hay số). Câu ngắn, rõ chủ ngữ, đúng chính tả, dấu câu thống nhất.
- Viết tự nhiên như giáo viên viết biên bản: không mở bài, không câu tổng kết sáo, không "đóng vai trò quan trọng", "không chỉ… mà còn", không liệt kê ba ý cho đẹp, không in đậm, không biểu tượng.
- Không đưa ý kiến của thành viên vào nội dung mục (ý kiến được in riêng ở cuối mỗi mục lớn).
- Trả về đủ mọi key được liệt kê. Mục thật sự không có gì để ghi thì trả mảng rỗng.`),
      [{
        type: "text",
        text: `[Bối cảnh buổi họp]\n${ctx}\n\n[Biểu mẫu của tổ]\n${forms || "(không có)"}\n\n[Ý kiến của thành viên đã ghi nhận — chỉ để hiểu, không chép vào mục]\n${opinions.join("\n") || "(không có)"}\n\n[Nội dung từng mục cần hoàn chỉnh]\n${blocks.join("\n\n")}`,
      }],
      {
        name: "hoan_chinh_bien_ban",
        description: "Nội dung hoàn chỉnh cuối cùng cho từng mục, mỗi ý một dòng",
        input_schema: {
          type: "object",
          properties: {
            muc: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  dong: { type: "array", items: { type: "string" } },
                },
                required: ["key", "dong"],
              },
            },
          },
          required: ["muc"],
        },
      },
      12000,
    );

    const byKey = new Map(sections.map((s) => [s.key, s]));
    let done = 0;
    let source = "hoan_chinh"; // cần migration 008; chưa chạy thì tạm ghi là ai_summary
    for (const m of out.muc ?? []) {
      const s = byKey.get(m.key);
      if (!s) continue;
      const items = (m.dong ?? []).map(cleanLine).filter((x) => x.length > 1);
      const w = work.get(s.id)!;
      if (!items.length && !w.content.length && !w.proposed.length) continue;
      const mine = ents.filter((e) => e.section_id === s.id && e.kind === "noi_dung");
      // Bản cũ ẩn đi (hoàn tác được); đề xuất chưa nhận đã được gộp nên bỏ
      const oldIds = mine.filter((e) => e.status === "accepted").map((e) => e.id);
      const propIds = mine.filter((e) => e.status === "proposed").map((e) => e.id);
      if (items.length) {
        const body = (s.layout === "inline" ? items.join(" ") : items.map((x) => `- ${x}`).join("\n")).slice(0, 8000);
        const row = { section_id: s.id, author_id: g.profile.id, body, source, status: "accepted", kind: "noi_dung" };
        let { error } = await sb.from("shcm_entries").insert(row);
        if (error && /source_check/.test(error.message)) {
          source = "ai_summary";
          ({ error } = await sb.from("shcm_entries").insert({ ...row, source }));
        }
        if (error) throw new AiError("Chưa lưu được bản hoàn chỉnh: " + error.message, 500);
      }
      if (oldIds.length) await sb.from("shcm_entries").update({ status: "dismissed" }).in("id", oldIds);
      if (propIds.length) await sb.from("shcm_entries").delete().in("id", propIds);
      done++;
    }
    if (!done) throw new AiError("AI chưa hoàn chỉnh được mục nào. Thầy thử lại hoặc chọn mô hình khác.", 422);

    const { error: fe } = await sb.from("shcm_meetings").update({ finalized_at: new Date().toISOString() }).eq("id", meetingId);

    // Thông tin buổi họp còn trống: bản xuất sẽ lược bỏ cho gọn, tổ trưởng biết để bổ sung nếu muốn
    const blanks: string[] = [];
    if (!meeting.meeting_date) blanks.push("ngày họp");
    if (!meeting.meeting_time) blanks.push("giờ bắt đầu");
    if (!meeting.end_time) blanks.push("giờ kết thúc");
    if (meeting.vote_agree == null) blanks.push("số biểu quyết (bản in ghi: các thành viên biểu quyết thông qua)");
    if (!meeting.chair_member_id) blanks.push("chủ trì");
    if (!meeting.secretary_member_id) blanks.push("thư ký");
    const { count: att } = await sb.from("shcm_attendance").select("member_id", { count: "exact", head: true }).eq("meeting_id", meetingId);
    if (!att) blanks.push("điểm danh");

    if (fe) blanks.unshift("CẦN CHẠY tệp supabase/migrations/008 trên Supabase để bản in bỏ hẳn các chỗ chấm trống");
    return Response.json({ ok: true, sections: done, blanks });
  } catch (e) {
    return errorResponse(e);
  }
}
