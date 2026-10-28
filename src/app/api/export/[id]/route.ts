import JSZip from "jszip";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDoc, toDocx, toHtml } from "@/lib/export";
import { BUCKET } from "@/lib/constants";
import { roman, slugify } from "@/lib/format";

export const maxDuration = 120;
const ZIP_LIMIT = 150 * 1024 * 1024;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") || "docx";
  const me = await getProfile();
  if (!me || me.status !== "approved") return new Response("Chưa đăng nhập", { status: 401 });
  if (me.role !== "to_truong") return new Response("Chỉ tổ trưởng xuất được biên bản.", { status: 403 });
  const supabase = await createClient();

  const d = await loadDoc(supabase, id, { imageBudget: format === "docx" ? 2.5 * 1024 * 1024 : 3 * 1024 * 1024 });
  if (!d) return new Response("Không tìm thấy biên bản", { status: 404 });
  const base = slugify(d.meeting.title) || "bien_ban";

  if (format === "html" || format === "pdf" || format === "preview") {
    const html = toHtml(d, { autoPrint: format === "pdf" });
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
    if (format === "html") headers["Content-Disposition"] = `attachment; filename="${base}.html"`;
    return new Response(html, { headers });
  }

  if (format === "docx") {
    const buf = await toDocx(d);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.docx"`,
      },
    });
  }

  if (format === "zip") {
    const zip = new JSZip();
    zip.file(`${base}.docx`, await toDocx(d));
    zip.file(`${base}.html`, toHtml(d));
    const skipped: string[] = [];
    let total = 0;
    for (let i = 0; i < d.sections.length; i++) {
      const s = d.sections[i];
      if (!s.files.length) continue;
      const folder = zip.folder(`minh_chung/${roman(i + 1)}_${slugify(s.title)}`)!;
      for (const f of s.files) {
        if (total + f.size > ZIP_LIMIT) { skipped.push(f.name); continue; }
        const { data } = await supabase.storage.from(BUCKET).download(f.path);
        if (!data) { skipped.push(f.name); continue; }
        total += f.size;
        let n = f.name, k = 1;
        while (folder.file(n)) n = f.name.replace(/(\.[^.]*)?$/, `_${++k}$1`);
        folder.file(n, await data.arrayBuffer());
      }
    }
    if (skipped.length) zip.file("minh_chung/KHONG_TAI_DUOC.txt", `Các tệp sau chưa vào gói (quá dung lượng hoặc không đọc được):\n${skipped.join("\n")}\n`);
    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    // Trả qua kho tệp vì phản hồi trực tiếp của máy chủ bị giới hạn dung lượng
    const path = `leader/export/${id}-${Date.now()}.zip`;
    const old = await supabase.storage.from(BUCKET).list("leader/export", { search: id });
    if (old.data?.length) await supabase.storage.from(BUCKET).remove(old.data.map((o) => `leader/export/${o.name}`));
    const up = await supabase.storage.from(BUCKET).upload(path, out, { contentType: "application/zip" });
    if (up.error) return new Response("Không tạo được gói: " + up.error.message, { status: 500 });
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, { download: `${base}_tron_goi.zip` });
    if (!signed?.signedUrl) return new Response("Không tạo được liên kết tải", { status: 500 });
    return Response.redirect(signed.signedUrl, 302);
  }
  return new Response("Định dạng không hỗ trợ", { status: 400 });
}
