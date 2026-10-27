import mammoth from "mammoth";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/constants";

export const maxDuration = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  if (!me || me.status !== "approved") return new Response("Chưa đăng nhập", { status: 401 });
  const supabase = await createClient();
  const { data: f } = await supabase.from("shcm_files").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!f) return new Response("Không tìm thấy tệp", { status: 404 });
  const { data, error } = await supabase.storage.from(BUCKET).download(f.storage_path);
  if (error || !data) return new Response("Không đọc được tệp", { status: 404 });
  let body: string;
  try {
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(await data.arrayBuffer()) });
    body = value;
  } catch {
    body = `<p>Không xem trực tiếp được tệp này. Bạn tải về để mở.</p>`;
  }
  // Trang chạy trong iframe sandbox, không script. CSP chặn thêm cho chắc.
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>${esc(f.file_name)}</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:800px;margin:1rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px}img{max-width:100%}</style>${body}`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" } });
}
