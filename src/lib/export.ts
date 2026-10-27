import {
  AlignmentType, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle,
} from "docx";
import { imageSize } from "image-size";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, SCHOOL_NAME, SCHOOL_YEAR, TEAM_NAME } from "@/lib/constants";
import { fmtDate, fmtTime, fmtWeekday, roman } from "@/lib/format";
import type { Meeting } from "@/lib/types";

export interface ExFile { id: string; name: string; mime: string | null; size: number; uploader: string; path: string; url?: string; image?: Buffer }
export interface ExEntry { author: string; when: string; body: string }
export interface ExSection { title: string; entries: ExEntry[]; files: ExFile[]; fileLabel: string }
export interface ExDoc {
  meeting: Meeting;
  leaderName: string;
  secretaryName: string;
  sections: ExSection[];
}

const fmtWhen = (ts: string) => fmtDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ts)));
const name = (p: { full_name: string | null; email?: string } | null | undefined) => p?.full_name || p?.email || "Thành viên đã rời tổ";

/** Gom dữ liệu biên bản. withImages: tải ảnh nhỏ để nhúng vào tệp xuất. */
export async function loadDoc(supabase: SupabaseClient, meetingId: string, opts: { imageBudget: number }): Promise<ExDoc | null> {
  const { data: m } = await supabase.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!m) return null;
  const [{ data: secs }, { data: leaders }] = await Promise.all([
    supabase.from("shcm_sections").select("*").eq("meeting_id", meetingId).order("position"),
    supabase.from("shcm_profiles").select("id, full_name, email").eq("role", "to_truong").eq("status", "approved").limit(1),
  ]);
  const ids = (secs ?? []).map((s) => s.id);
  const [{ data: ents }, { data: files }] = await Promise.all([
    ids.length ? supabase.from("shcm_entries").select("section_id, body, created_at, author:author_id(full_name, email)").in("section_id", ids).eq("status", "accepted").order("created_at") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("shcm_files").select("id, section_id, file_name, mime_type, size_bytes, storage_path, created_at, uploader:uploaded_by(full_name, email)").in("section_id", ids).eq("kind", "minh_chung").order("created_at") : Promise.resolve({ data: [] }),
  ]);
  let secretaryName = "";
  if (m.secretary_id) {
    const { data: s } = await supabase.from("shcm_profiles").select("full_name, email").eq("id", m.secretary_id).maybeSingle();
    secretaryName = name(s);
  }

  const all = (files ?? []);
  const urls: Record<string, string> = {};
  if (all.length) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(all.map((f) => f.storage_path), 7 * 24 * 3600);
    signed?.forEach((s, i) => { if (s.signedUrl) urls[all[i].id] = s.signedUrl; });
  }
  let budget = opts.imageBudget;
  const exFiles = new Map<string, ExFile[]>();
  for (const f of all) {
    const ex: ExFile = {
      id: f.id, name: f.file_name, mime: f.mime_type, size: Number(f.size_bytes ?? 0),
      uploader: name(f.uploader as unknown as { full_name: string | null; email?: string }), path: f.storage_path, url: urls[f.id],
    };
    if (/^image\/(png|jpe?g)$/.test(f.mime_type ?? "") && ex.size > 0 && ex.size <= 700 * 1024 && ex.size <= budget && urls[f.id]) {
      try {
        const { data: blob } = await supabase.storage.from(BUCKET).download(f.storage_path);
        if (blob) { ex.image = Buffer.from(await blob.arrayBuffer()); budget -= ex.image.length; }
      } catch { /* bỏ qua, vẫn có liên kết */ }
    }
    const arr = exFiles.get(f.section_id) ?? [];
    arr.push(ex);
    exFiles.set(f.section_id, arr);
  }

  return {
    meeting: m as Meeting,
    leaderName: name(leaders?.[0]),
    secretaryName,
    sections: (secs ?? []).map((s) => ({
      title: s.title,
      fileLabel: s.file_label || "Minh chứng",
      entries: (ents ?? []).filter((e) => e.section_id === s.id).map((e) => ({
        author: name(e.author as unknown as { full_name: string | null; email?: string }), when: fmtWhen(e.created_at), body: e.body,
      })),
      files: exFiles.get(s.id) ?? [],
    })),
  };
}

function infoRows(d: ExDoc): [string, string][] {
  const m = d.meeting;
  const rows: [string, string][] = [];
  if (m.meeting_date) rows.push(["Thời gian", `${fmtTime(m.meeting_time)}, ${fmtWeekday(m.meeting_date)}, ngày ${fmtDate(m.meeting_date)}`]);
  if (m.place) rows.push(["Địa điểm", m.place]);
  if (m.topic) rows.push(["Nội dung chính", m.topic]);
  rows.push(["Chủ trì", d.leaderName || "Tổ trưởng"]);
  rows.push(["Thư kí", d.secretaryName || "…………………"]);
  if (m.attendance_note) rows.push(["Thành phần dự họp", m.attendance_note]);
  return rows;
}

const isBullet = (l: string) => /^\s*[-•]\s+/.test(l);
const unBullet = (l: string) => l.replace(/^\s*[-•]\s+/, "");

// ---------------------------------------------------------------- HTML
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toHtml(d: ExDoc, opts: { autoPrint?: boolean } = {}): string {
  const m = d.meeting;
  const sec = d.sections.map((s, i) => {
    const ents = s.entries.map((e) => {
      const lines = e.body.split("\n").filter((l) => l.trim());
      const first = lines[0] && !isBullet(lines[0]) ? lines.shift()! : "";
      const bullets = lines.map((l) => `<li>${esc(unBullet(l))}</li>`).join("");
      return `<div class="e"><p><b>${esc(e.author)}</b> <span class="w">(${e.when})</span>${first ? ": " + esc(first) : ""}</p>${bullets ? `<ul>${bullets}</ul>` : ""}</div>`;
    }).join("") || `<p class="w">Chưa có nội dung.</p>`;
    const files = s.files.length
      ? `<p><i>${esc(s.fileLabel)} (xem phụ lục ${roman(i + 1)}):</i> ${s.files.map((f) => esc(f.name)).join("; ")}</p>`
      : "";
    return `<h2>${roman(i + 1)}. ${esc(s.title)}</h2>${ents}${files}`;
  }).join("");

  const appendix = d.sections.filter((s) => s.files.length).map((s) => {
    const idx = d.sections.indexOf(s);
    const items = s.files.map((f) => {
      const img = f.image ? `<div><img alt="${esc(f.name)}" src="data:${f.mime};base64,${f.image.toString("base64")}"></div>` : "";
      const link = f.url ? `<a href="${esc(f.url)}">${esc(f.name)}</a>` : esc(f.name);
      return `<li>${link} <span class="w">— ${esc(f.uploader)}</span>${img}</li>`;
    }).join("");
    return `<h3>Phụ lục ${roman(idx + 1)}. ${esc(s.title)}</h3><ul class="files">${items}</ul>`;
  }).join("");

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.title)}</title>
<style>
body{font:16px/1.6 "Times New Roman",serif;max-width:820px;margin:0 auto;padding:24px;color:#111}
.top{display:flex;justify-content:space-between;text-align:center;font-weight:bold;font-size:14px}
h1{text-align:center;font-size:20px;margin:18px 0 2px}.sub{text-align:center;margin:0 0 14px}
table.i td{padding:2px 10px 2px 0;vertical-align:top}h2{font-size:17px;margin:20px 0 6px}h3{font-size:15px}
.w{color:#666;font-size:13px}.e p{margin:6px 0 2px}ul{margin:2px 0 8px}
.sig{display:flex;justify-content:space-around;text-align:center;margin-top:36px;font-weight:bold}
img{max-width:100%;max-height:360px}.files li{margin-bottom:10px}
.note{font-size:12px;color:#777;margin-top:30px}
@media print{body{padding:0}a{color:inherit;text-decoration:none}}
</style></head><body>
<div class="top"><div>${esc(SCHOOL_NAME)}<br>${esc(TEAM_NAME)}</div><div>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập – Tự do – Hạnh phúc</div></div>
<h1>BIÊN BẢN SINH HOẠT CHUYÊN MÔN</h1>
<p class="sub"><b>${esc(m.title)}</b> · Năm học ${esc(SCHOOL_YEAR)}</p>
<table class="i">${infoRows(d).map(([a, b]) => `<tr><td><b>${esc(a)}:</b></td><td>${esc(b)}</td></tr>`).join("")}</table>
${sec}
<div class="sig"><div>THƯ KÍ<br><br><br><br>${esc(d.secretaryName)}</div><div>TỔ TRƯỞNG<br><br><br><br>${esc(d.leaderName)}</div></div>
${appendix ? `<h2 style="page-break-before:always">PHỤ LỤC: MINH CHỨNG</h2>${appendix}<p class="note">Liên kết tệp có hiệu lực 7 ngày kể từ lúc xuất. Muốn lưu lâu dài, dùng "Tải trọn gói" để có đủ tệp.</p>` : ""}
${opts.autoPrint ? "<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>" : ""}
</body></html>`;
}

// ---------------------------------------------------------------- DOCX
const FONT = "Times New Roman";
const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 26, bold: o.bold, italics: o.italics, color: o.color });

export async function toDocx(d: ExDoc): Promise<Buffer> {
  const m = d.meeting;
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const children: (Paragraph | Table)[] = [];

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, width: { size: 45, type: WidthType.PERCENTAGE }, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(SCHOOL_NAME, { bold: true, size: 24 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(TEAM_NAME, { bold: true, size: 24 })] }),
      ] }),
      new TableCell({ borders: noBorders, width: { size: 55, type: WidthType.PERCENTAGE }, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 24 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Độc lập – Tự do – Hạnh phúc", { bold: true, size: 24 })] }),
      ] }),
    ] })],
  }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [run("BIÊN BẢN SINH HOẠT CHUYÊN MÔN", { bold: true, size: 30 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(`${m.title} · Năm học ${SCHOOL_YEAR}`, { bold: true })] }));
  for (const [a, b] of infoRows(d)) {
    children.push(new Paragraph({ spacing: { after: 40 }, children: [run(`${a}: `, { bold: true }), run(b)] }));
  }

  d.sections.forEach((s, i) => {
    children.push(new Paragraph({ spacing: { before: 280, after: 80 }, keepNext: true, children: [run(`${roman(i + 1)}. ${s.title}`, { bold: true })] }));
    if (!s.entries.length) children.push(new Paragraph({ children: [run("Chưa có nội dung.", { italics: true, color: "777777" })] }));
    for (const e of s.entries) {
      const lines = e.body.split("\n").filter((l) => l.trim());
      const first = lines[0] && !isBullet(lines[0]) ? lines.shift()! : "";
      children.push(new Paragraph({ spacing: { before: 60, after: 40 }, children: [run(e.author, { bold: true }), run(` (${e.when})`, { size: 22, color: "666666" }), run(first ? `: ${first}` : "")] }));
      for (const l of lines) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [run(unBullet(l))] }));
      }
    }
    if (s.files.length) {
      children.push(new Paragraph({ spacing: { before: 60 }, children: [run(`${s.fileLabel} (xem phụ lục ${roman(i + 1)}): `, { italics: true }), run(s.files.map((f) => f.name).join("; "))] }));
    }
  });

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [run("THƯ KÍ", { bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 900 }, children: [run(d.secretaryName)] }),
      ] }),
      new TableCell({ borders: noBorders, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [run("TỔ TRƯỞNG", { bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 900 }, children: [run(d.leaderName)] }),
      ] }),
    ] })],
  }));

  const withFiles = d.sections.map((s, i) => ({ s, i })).filter((x) => x.s.files.length);
  if (withFiles.length) {
    children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, children: [run("PHỤ LỤC: MINH CHỨNG", { bold: true })] }));
    for (const { s, i } of withFiles) {
      children.push(new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [run(`Phụ lục ${roman(i + 1)}. ${s.title}`, { bold: true })] }));
      for (const f of s.files) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [run(f.name), run(` — ${f.uploader}`, { size: 22, color: "666666" })] }));
        if (f.image) {
          try {
            const dim = imageSize(f.image);
            const w = Math.min(420, dim.width ?? 420);
            const h = Math.round(w * ((dim.height ?? 300) / (dim.width ?? 420)));
            children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: dim.type === "png" ? "png" : "jpg", data: f.image, transformation: { width: w, height: Math.min(h, 520) } })] }));
          } catch { /* bỏ qua ảnh lỗi */ }
        }
      }
    }
    children.push(new Paragraph({ spacing: { before: 200 }, children: [run("Tệp gốc (ảnh lớn, clip, tài liệu) có trong gói tải trọn gói.", { italics: true, size: 22 })] }));
  }

  const doc = new Document({
    creator: "Sinh hoạt chuyên môn",
    title: m.title,
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
