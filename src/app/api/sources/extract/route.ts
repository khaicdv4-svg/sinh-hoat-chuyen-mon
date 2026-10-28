import { AiError, bufferToText, errorResponse } from "@/lib/ai";
import { getProfile } from "@/lib/auth";
import { BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Đọc chữ từ tệp nguồn đã tải lên và lưu để AI tham khảo. */
export async function POST(req: Request) {
  try {
    const profile = await getProfile();
    if (!profile || profile.status !== "approved" || profile.role !== "to_truong") throw new AiError("Chỉ tổ trưởng dùng được.", 403);
    const { sourceId } = (await req.json()) as { sourceId?: string };
    if (!sourceId) throw new AiError("Thiếu nguồn.");
    const supabase = await createClient();
    const { data: src } = await supabase.from("shcm_sources").select("*").eq("id", sourceId).maybeSingle();
    if (!src?.storage_path) throw new AiError("Không tìm thấy tệp của nguồn này.", 404);
    const { data, error } = await supabase.storage.from(BUCKET).download(src.storage_path);
    if (error || !data) throw new AiError("Không đọc được tệp: " + (error?.message ?? ""), 404);
    const text = (await bufferToText(Buffer.from(await data.arrayBuffer()), src.file_name ?? "", src.mime_type)).replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new AiError("Tệp không có chữ để đọc (có thể là ảnh chụp). Dán nội dung vào ô ghi chú của nguồn.", 422);
    const { error: e2 } = await supabase.from("shcm_sources").update({ text_content: text.slice(0, 200000) }).eq("id", sourceId);
    if (e2) throw new AiError(e2.message, 500);
    return Response.json({ ok: true, chars: Math.min(text.length, 200000) });
  } catch (e) {
    return errorResponse(e);
  }
}
