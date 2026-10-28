import { aiGuard, askTool, errorResponse, fileToBlocks, SYSTEM_BASE, AiError } from "@/lib/ai";
import { partLabel, slugify } from "@/lib/format";

export const maxDuration = 300;

type Out = {
  thong_tin?: { giai_doan_ncbh?: string; thu_ky?: string };
  muc_moi?: { tam: string; phan: string; ten: string; sau_muc?: string; ai_ghi?: "all" | "leader"; co_minh_chung?: boolean }[];
  doan: { muc: string; nguoi_noi?: string | null; noi_dung: string }[];
  bo_qua?: number;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/^(thay|co)\s+/, "").replace(/\s+/g, " ").trim();

/** Đọc biên bản Word/PDF đã soạn, đưa từng đoạn vào đúng mục của biên bản (dạng đề xuất). */
export async function POST(req: Request) {
  try {
    const { meetingId, fileId } = (await req.json()) as { meetingId?: string; fileId?: string };
    if (!meetingId || !fileId) throw new AiError("Thiếu biên bản hoặc tệp.");
    const g = await aiGuard({ leaderOnly: true });

    const { data: meeting } = await g.supabase.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
    if (!meeting) throw new AiError("Không tìm thấy biên bản.", 404);
    if (meeting.status === "locked") throw new AiError("Biên bản đã khóa.", 409);
    const { data: file } = await g.supabase.from("shcm_files").select("*").eq("id", fileId).maybeSingle();
    if (!file) throw new AiError("Không tìm thấy tệp.", 404);

    const [{ data: secs }, { data: roster }] = await Promise.all([
      g.supabase.from("shcm_sections").select("id, key, title, part, position").eq("meeting_id", meetingId).order("position"),
      g.supabase.from("shcm_members").select("id, honorific, full_name, title"),
    ]);
    const sections = secs ?? [];
    const members = roster ?? [];
    const parts = Array.from(new Set(sections.map((s) => s.part).filter(Boolean))) as string[];

    const doc = await fileToBlocks(g, file.storage_path, file.file_name, file.mime_type);
    const sectionList = sections
      .map((s) => `- key "${s.key}": ${partLabel(s.part, meeting.week_from, meeting.week_to) || "(không thuộc phần nào)"} › ${s.title}`)
      .join("\n");
    const memberList = members.map((m) => `- ${m.honorific} ${m.full_name}${m.title ? ` (${m.title})` : ""}`).join("\n");

    const out = await askTool<Out>(
      g, "nhap_bien_ban",
      `${SYSTEM_BASE}
Nhiệm vụ: đọc một biên bản sinh hoạt tổ đã soạn sẵn và chia nội dung vào các mục của biên bản điện tử.
Quy tắc:
- Giữ nguyên câu chữ của biên bản, không viết lại, không tóm tắt, không thêm ý.
- Bỏ phần đầu (tên trường, quốc hiệu, tiêu đề, thời gian, địa điểm, danh sách thành phần tham dự) và phần chữ ký: những phần này ứng dụng tự tạo. Chỉ lấy giai đoạn NCBH và tên thư ký vào thong_tin.
- Bỏ tên mục và số thứ tự ở đầu đoạn (ví dụ "1. Công tác chuyên môn:"), chỉ giữ nội dung sau đó.
- Bỏ những đoạn chỉ có dấu chấm để trống (…… hoặc ......) và phần chữ đi kèm chỉ để chờ điền (như "Ghi nhận cụ thể tại cuộc họp: ......"). Đếm số chỗ bỏ vào bo_qua. Nếu một câu có nội dung thật rồi mới tới chấm chấm thì giữ phần nội dung thật.
- Ý kiến dạng "Thầy/Cô Họ Tên: nội dung": nguoi_noi là họ tên đó (không kèm Thầy/Cô), noi_dung là phần sau dấu hai chấm. Mỗi người một đoạn.
- Mục vận dụng có đánh số "1. Cô X: ..." cũng tách theo người. Dòng giao cho nhóm người (ví dụ "Giáo viên chủ nhiệm các lớp…") thì nguoi_noi để trống và giữ cả chủ ngữ trong noi_dung.
- Các đoạn liền nhau của cùng một mục, không gắn với người nói, gộp thành một đoạn, giữ xuống dòng.
- Nội dung không hợp mục nào sẵn có thì tạo mục mới trong muc_moi (tam = "moi1", "moi2"…), chọn phan đúng một trong các phần đã có nếu hợp, sau_muc là key của mục đứng trước nó. Ví dụ phần NCBH, sinh hoạt chuyên đề nếu biên bản chưa có mục tương ứng.
- "Nội dung thống nhất" ở phần biểu quyết, kết luận đưa vào mục ket_luan. Bỏ dòng số biểu quyết và giờ kết thúc nếu còn chấm chấm.`,
      [
        ...doc,
        {
          type: "text",
          text: `Các mục hiện có của biên bản (dùng đúng key):\n${sectionList}\n\nCác phần đang dùng:\n${parts.map((p) => `- ${p}`).join("\n")}\n\nThành viên tổ:\n${memberList}`,
        },
      ],
      {
        name: "chia_noi_dung",
        description: "Nội dung biên bản đã chia vào các mục",
        input_schema: {
          type: "object",
          properties: {
            thong_tin: {
              type: "object",
              properties: {
                giai_doan_ncbh: { type: "string", description: "Dòng 'GIAI ĐOẠN ĐANG THỰC HIỆN: …' nếu có, chỉ lấy phần sau dấu hai chấm" },
                thu_ky: { type: "string", description: "Họ tên thư ký nếu có" },
              },
            },
            muc_moi: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tam: { type: "string" },
                  phan: { type: "string" },
                  ten: { type: "string" },
                  sau_muc: { type: "string" },
                  ai_ghi: { type: "string", enum: ["all", "leader"], description: "all nếu là ý kiến của các thành viên, leader nếu là nội dung tổ trưởng ghi" },
                  co_minh_chung: { type: "boolean" },
                },
                required: ["tam", "phan", "ten"],
              },
            },
            doan: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  muc: { type: "string", description: "key của mục có sẵn hoặc tam của mục mới" },
                  nguoi_noi: { type: ["string", "null"] },
                  noi_dung: { type: "string" },
                },
                required: ["muc", "noi_dung"],
              },
            },
            bo_qua: { type: "integer" },
          },
          required: ["doan"],
        },
      },
      16000,
    );

    // Tạo mục mới
    const keyMap = new Map<string, string>(sections.map((s) => [s.key, s.id]));
    const used = new Set(sections.map((s) => s.key));
    let newSections = 0;
    for (const m of out.muc_moi ?? []) {
      if (!m.ten?.trim()) continue;
      const after = sections.find((s) => s.key === m.sau_muc);
      const samePart = sections.filter((s) => s.part === m.phan);
      const pos = after ? after.position + 5 : samePart.length ? samePart[samePart.length - 1].position + 5 : 500 + newSections;
      let key = slugify(m.ten) || `muc_${newSections + 1}`;
      while (used.has(key)) key += "_2";
      used.add(key);
      const yKien = /ý kiến/i.test(m.ten);
      const { data: ins, error } = await g.supabase
        .from("shcm_sections")
        .insert({
          meeting_id: meetingId, key, title: m.ten.trim(), part: m.phan || null, position: pos, layout: "block",
          entry_editors: m.ai_ghi === "leader" ? "leader" : "all", file_editors: "all",
          files_mode: m.co_minh_chung ? "evidence" : "none", ai_action: yKien ? "gom_y_kien" : "none", allow_opinions: true,
        })
        .select("id, key, title, part, position")
        .single();
      if (error || !ins) continue;
      keyMap.set(m.tam, ins.id);
      keyMap.set(ins.key, ins.id);
      sections.push(ins);
      newSections++;
    }

    // Ghép tên người nói với danh sách thành viên
    const findMember = (name?: string | null) => {
      if (!name?.trim()) return null;
      const n = norm(name);
      return members.find((m) => norm(m.full_name) === n) ?? members.find((m) => n.includes(norm(m.full_name)) || norm(m.full_name).includes(n)) ?? null;
    };

    let entries = 0;
    const touched = new Set<string>();
    for (const d of out.doan ?? []) {
      const sid = keyMap.get(d.muc);
      const body = d.noi_dung?.trim();
      if (!sid || !body || /^[.…\s]+$/.test(body)) continue;
      const sp = findMember(d.nguoi_noi);
      const text = !sp && d.nguoi_noi ? `${d.nguoi_noi}: ${body}` : body;
      const { error } = await g.supabase.from("shcm_entries").insert({
        section_id: sid, author_id: g.profile.id, body: text.slice(0, 8000), source: "nhap_file",
        source_file_id: fileId, status: "proposed", speaker_id: sp?.id ?? null,
      });
      if (!error) { entries++; touched.add(sid); }
    }

    const patch: Record<string, unknown> = {};
    if (out.thong_tin?.giai_doan_ncbh && !meeting.ncbh_stage) patch.ncbh_stage = out.thong_tin.giai_doan_ncbh.trim();
    const sec = findMember(out.thong_tin?.thu_ky);
    if (sec && !meeting.secretary_member_id) patch.secretary_member_id = sec.id;
    if (Object.keys(patch).length) await g.supabase.from("shcm_meetings").update(patch).eq("id", meetingId);

    return Response.json({ ok: true, entries, sections: touched.size, newSections, skipped: out.bo_qua ?? 0 });
  } catch (e) {
    return errorResponse(e);
  }
}
