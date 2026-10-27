import { aiGuard, askTool, errorResponse, fileToBlocks, SYSTEM_BASE, AiError } from "@/lib/ai";
import { fmtDate, todayVN } from "@/lib/format";

export const maxDuration = 120;

/**
 * Hai bước:
 *  mode "analyze": AI đọc văn bản mới, tóm tắt, nêu hiệu lực và gợi ý phạm vi áp dụng.
 *  mode "apply": ghi các điểm đã chốt vào mục "Triển khai văn bản mới" của các biên bản được chọn.
 * Biên bản đã khóa hoặc đã qua ngày họp không bao giờ bị thay đổi.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode: "analyze" | "apply";
      fileId: string;
      scope?: "next" | "from_now" | "meeting";
      meetingId?: string;
      points?: string[];
    };
    const g = await aiGuard({ leaderOnly: true });
    const { data: file } = await g.supabase.from("shcm_files").select("*").eq("id", body.fileId).eq("kind", "van_ban_moi").maybeSingle();
    if (!file) throw new AiError("Không tìm thấy văn bản.", 404);

    const today = todayVN();
    const { data: ms } = await g.supabase.from("shcm_meetings").select("id, title, week_from, week_to, meeting_date, status").eq("kind", "sinh_hoat").order("week_from");
    const eligible = (ms ?? []).filter((m) => m.status === "open" && (!m.meeting_date || m.meeting_date >= today));

    if (body.mode === "analyze") {
      const doc = await fileToBlocks(g, file.storage_path, file.file_name, file.mime_type);
      const list = eligible.map((m) => `- ${m.title} (họp ${fmtDate(m.meeting_date)})`).join("\n");
      const out = await askTool<{ ten_van_ban: string; tom_tat: string; diem_ap_dung: string[]; hieu_luc: string; goi_y: "next" | "from_now"; ly_do: string }>(
        g, "van_ban_moi",
        `${SYSTEM_BASE}\nNhiệm vụ: đọc một văn bản mới của Bộ, Sở hoặc nhà trường, rút ra những điểm tổ chuyên môn khối 4 cần thực hiện và gợi ý nên áp dụng từ biên bản nào. Chỉ ghi điều văn bản thật sự nêu.`,
        [...doc, { type: "text", text: `Hôm nay là ${fmtDate(today)}. Các biên bản còn có thể áp dụng:\n${list}\nChỉ có thể áp dụng cho các biên bản trên; biên bản đã họp hoặc đã khóa không được sửa.` }],
        {
          name: "phan_tich_van_ban",
          description: "Tóm tắt văn bản và gợi ý phạm vi áp dụng",
          input_schema: {
            type: "object",
            properties: {
              ten_van_ban: { type: "string" },
              tom_tat: { type: "string", description: "2-3 câu" },
              diem_ap_dung: { type: "array", items: { type: "string" }, description: "Các việc tổ cần làm, mỗi việc một câu" },
              hieu_luc: { type: "string", description: "Ngày hiệu lực hoặc thời hạn thực hiện nếu văn bản nêu, nếu không thì ghi 'không nêu'" },
              goi_y: { type: "string", enum: ["next", "from_now"], description: "next: chỉ biên bản kế tiếp; from_now: từ biên bản kế tiếp trở đi" },
              ly_do: { type: "string" },
            },
            required: ["ten_van_ban", "tom_tat", "diem_ap_dung", "hieu_luc", "goi_y", "ly_do"],
          },
        },
        3000,
      );
      return Response.json({ ...out, meetings: eligible.map((m) => ({ id: m.id, title: m.title, date: m.meeting_date })) });
    }

    // apply
    const points = (body.points ?? []).map((p) => p.trim()).filter(Boolean);
    if (!points.length) throw new AiError("Chưa có điểm nào để áp dụng.");
    let targets = eligible;
    if (body.scope === "next") targets = eligible.slice(0, 1);
    else if (body.scope === "meeting") {
      targets = eligible.filter((m) => m.id === body.meetingId);
      if (!targets.length) throw new AiError("Biên bản đó đã khóa hoặc đã qua ngày họp nên không áp dụng được.", 409);
    }
    if (!targets.length) throw new AiError("Không còn biên bản nào để áp dụng.", 409);

    const text = `Theo văn bản "${file.file_name}":\n` + points.map((p) => `- ${p}`).join("\n");
    let done = 0;
    for (const m of targets) {
      const { data: sec } = await g.supabase.from("shcm_sections").select("id").eq("meeting_id", m.id).eq("key", "van_ban").maybeSingle();
      if (!sec) continue;
      await g.supabase.from("shcm_entries").delete().eq("section_id", sec.id).eq("source_file_id", file.id).eq("status", "proposed");
      const { error } = await g.supabase.from("shcm_entries").insert({ section_id: sec.id, author_id: g.profile.id, body: text.slice(0, 8000), source: "van_ban_moi", source_file_id: file.id, status: "proposed" });
      if (!error) done++;
    }
    const scopeLabel = body.scope === "next" ? "biên bản kế tiếp" : body.scope === "meeting" ? targets[0].title : "từ biên bản kế tiếp trở đi";
    await g.supabase.from("shcm_files").update({ applied_at: new Date().toISOString(), applied_scope: scopeLabel }).eq("id", file.id);
    return Response.json({ ok: true, meetings: done });
  } catch (e) {
    return errorResponse(e);
  }
}
