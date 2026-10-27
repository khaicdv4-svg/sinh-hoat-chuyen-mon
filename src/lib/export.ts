import {
  AlignmentType, BorderStyle, Document, ImageRun, LineRuleType, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { imageSize } from "image-size";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, SCHOOL_NAME, SCHOOL_YEAR, TEAM_NAME } from "@/lib/constants";
import { groupByPart, partLabel, roman } from "@/lib/format";
import type { Attendance, Meeting, Member } from "@/lib/types";

export interface ExFile { id: string; name: string; mime: string | null; size: number; uploader: string; path: string; url?: string; image?: Buffer }
export interface ExEntry { speaker: string | null; body: string }
export interface ExSection { key: string; title: string; part: string | null; layout: "block" | "inline" | "list"; entries: ExEntry[]; files: ExFile[]; fileLabel: string }
export interface ExDoc {
  meeting: Meeting;
  chair: Member | null;
  secretary: Member | null;
  members: Member[];
  attendance: Attendance[];
  sections: ExSection[];
}

const DOTS = ".".repeat(118);
const SHORT_DOTS = "......";
const fullName = (m: Member | null) => (m ? `${m.honorific} ${m.full_name}` : "");
const withTitle = (m: Member) => `${m.full_name}${m.title ? ` - ${m.title}` : ""}.`;

export async function loadDoc(supabase: SupabaseClient, meetingId: string, opts: { imageBudget: number }): Promise<ExDoc | null> {
  const { data: m } = await supabase.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!m) return null;
  const [{ data: secs }, { data: mem }, { data: att }] = await Promise.all([
    supabase.from("shcm_sections").select("*").eq("meeting_id", meetingId).order("position"),
    supabase.from("shcm_members").select("*").order("sort_order"),
    supabase.from("shcm_attendance").select("*").eq("meeting_id", meetingId),
  ]);
  const members = (mem ?? []) as Member[];
  const ids = (secs ?? []).map((s) => s.id);
  const [{ data: ents }, { data: files }] = await Promise.all([
    ids.length ? supabase.from("shcm_entries").select("section_id, body, speaker_id, created_at").in("section_id", ids).eq("status", "accepted").order("created_at") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("shcm_files").select("id, section_id, file_name, mime_type, size_bytes, storage_path, created_at, uploader:uploaded_by(full_name, email)").in("section_id", ids).eq("kind", "minh_chung").order("created_at") : Promise.resolve({ data: [] }),
  ]);

  const all = files ?? [];
  const urls: Record<string, string> = {};
  if (all.length) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(all.map((f) => f.storage_path), 7 * 24 * 3600);
    signed?.forEach((s, i) => { if (s.signedUrl) urls[all[i].id] = s.signedUrl; });
  }
  let budget = opts.imageBudget;
  const exFiles = new Map<string, ExFile[]>();
  for (const f of all) {
    const up = f.uploader as unknown as { full_name: string | null; email?: string } | null;
    const ex: ExFile = {
      id: f.id, name: f.file_name, mime: f.mime_type, size: Number(f.size_bytes ?? 0),
      uploader: up?.full_name || up?.email || "", path: f.storage_path, url: urls[f.id],
    };
    if (/^image\/(png|jpe?g)$/.test(f.mime_type ?? "") && ex.size > 0 && ex.size <= 700 * 1024 && ex.size <= budget) {
      try {
        const { data: blob } = await supabase.storage.from(BUCKET).download(f.storage_path);
        if (blob) { ex.image = Buffer.from(await blob.arrayBuffer()); budget -= ex.image.length; }
      } catch { /* vẫn còn liên kết */ }
    }
    const arr = exFiles.get(f.section_id) ?? [];
    arr.push(ex);
    exFiles.set(f.section_id, arr);
  }

  const byId = (id: string | null) => members.find((x) => x.id === id) ?? null;
  return {
    meeting: m as Meeting,
    chair: byId(m.chair_member_id),
    secretary: byId(m.secretary_member_id),
    members,
    attendance: (att ?? []) as Attendance[],
    sections: (secs ?? []).map((s) => ({
      key: s.key, title: s.title, part: s.part, layout: s.layout ?? "block",
      fileLabel: s.file_label || "Minh chứng",
      entries: (ents ?? []).filter((e) => e.section_id === s.id).map((e) => ({ speaker: fullName(byId(e.speaker_id)) || null, body: e.body })),
      files: exFiles.get(s.id) ?? [],
    })),
  };
}

// ------------------------------------------------------------------ Mô hình chung cho Word và HTML
type Run = { t: string; b?: boolean; i?: boolean; size?: number };
type Para = { runs: Run[]; align?: "center" | "justify"; indent?: boolean; keepNext?: boolean };
type Block = Para | { table: "sign" } | { table: "members" } | { pageBreak: true } | { image: ExFile };

function timeParts(t: string | null | undefined): [string, string] {
  if (!t) return [SHORT_DOTS, SHORT_DOTS];
  const [h, m] = t.split(":");
  return [h, m];
}

function vnDate(d: string | null) {
  if (!d) return `ngày ${SHORT_DOTS} tháng ${SHORT_DOTS} năm ${SHORT_DOTS}`;
  const [y, m, day] = d.split("-");
  return `ngày ${day} tháng ${m} năm ${y}`;
}

export function present(d: ExDoc) {
  const active = d.members.filter((m) => m.active);
  const absentIds = new Set(d.attendance.filter((a) => !a.present).map((a) => a.member_id));
  return { active, absentIds, recorded: d.attendance.length > 0 };
}

function buildBlocks(d: ExDoc): Block[] {
  const m = d.meeting;
  const out: Block[] = [];
  const p = (runs: Run[], o: Partial<Para> = {}) => out.push({ runs, align: "justify", indent: true, ...o });
  const bodyLines = (text: string, prefix?: Run[]) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((l, i) => p(i === 0 && prefix ? [...prefix, { t: l }] : [{ t: l }]));
    if (!lines.length && prefix) p(prefix);
  };

  out.push({ runs: [{ t: "BIÊN BẢN SINH HOẠT CHUYÊN MÔN", b: true, size: 15 }], align: "center" });
  if (m.kind === "sinh_hoat" && m.week_from != null) {
    out.push({ runs: [{ t: `TỔ 4 TUẦN ${m.week_from} + ${m.week_to}`, b: true }], align: "center" });
  } else {
    out.push({ runs: [{ t: m.title.toUpperCase(), b: true }], align: "center" });
  }
  out.push({ runs: [{ t: `Năm học ${SCHOOL_YEAR.replace("-", " - ")}`, b: true }], align: "center" });

  const [h, mi] = timeParts(m.meeting_time);
  p([{ t: `Thời gian bắt đầu: Lúc ${h} giờ ${mi} phút, ${vnDate(m.meeting_date)}.` }]);
  p([{ t: `Địa điểm: ${m.place || DOTS.slice(0, 60)}.` }]);

  // A. Thành phần
  const { active, absentIds, recorded } = present(d);
  p([{ t: "A. THÀNH PHẦN THAM DỰ", b: true }], { keepNext: true });
  p([{ t: `1. Chủ trì: ${d.chair ? withTitle(d.chair) : DOTS.slice(0, 60)}` }]);
  p([{ t: `2. Thư ký: ${d.secretary ? withTitle(d.secretary) : DOTS.slice(0, 60)}` }]);
  p([{ t: "3. Thành phần khác:", b: true }], { keepNext: true });
  for (const mem of active.filter((x) => x.id !== d.chair?.id && x.id !== d.secretary?.id)) {
    p([{ t: `- ${mem.honorific} ${withTitle(mem)}` }]);
  }
  const total = String(active.length).padStart(2, "0");
  if (recorded) {
    const absent = active.filter((x) => absentIds.has(x.id));
    p([{ t: `Có mặt: ${String(active.length - absent.length).padStart(2, "0")}/${total}. Vắng mặt: ${absent.length ? absent.map(fullName).join(", ") : "không"}.` }]);
    if (absent.length) {
      const reasons = absent.map((x) => {
        const r = d.attendance.find((a) => a.member_id === x.id)?.reason;
        return `${fullName(x)}${r ? ` (${r})` : ""}`;
      });
      p([{ t: `Lý do vắng: ${reasons.join("; ")}.` }]);
    }
  } else {
    p([{ t: `Có mặt: ${SHORT_DOTS} /${total}. Vắng mặt: ${DOTS.slice(0, 65)}` }]);
    p([{ t: `Lý do vắng: ${DOTS.slice(0, 76)}` }]);
  }

  // B. Nội dung, C. Kết luận
  const groups = groupByPart(d.sections);
  const isC = (part: string | null) => !!part && /^C\./.test(part.trim());
  p([{ t: "B. NỘI DUNG CUỘC HỌP", b: true }], { keepNext: true });
  let looseNo = 0;

  const renderSection = (s: ExSection, no: number | null) => {
    if (s.layout === "inline") {
      const label: Run = { t: `${no ? `${no}. ` : ""}${s.title}: ` };
      const [first, ...rest] = s.entries;
      if (!first) p([label, { t: DOTS.slice(0, 80) }]);
      else bodyLines(first.speaker ? `${first.speaker}: ${first.body}` : first.body, [label]);
      rest.forEach((e) => bodyLines(e.speaker ? `${e.speaker}: ${e.body}` : e.body));
    } else if (s.layout === "list") {
      if (!s.entries.length) p([{ t: DOTS }]);
      s.entries.forEach((e, i) => bodyLines(e.body, [{ t: `${i + 1}. ` }, ...(e.speaker ? [{ t: `${e.speaker}: ` }] : [])]));
    } else {
      if (s.title) p([{ t: `${no ? `${no}. ` : ""}${s.title}`, b: true }], { keepNext: true });
      if (m.ncbh_stage && (s.key === "ncbh_thong_tin" || /^nghiên cứu bài học/i.test(s.title))) {
        out.push({ runs: [{ t: "GIAI ĐOẠN ĐANG THỰC HIỆN: ", size: 13 }, { t: m.ncbh_stage.toUpperCase(), b: true, size: 13 }], align: "center", indent: true });
      }
      if (!s.entries.length) p([{ t: DOTS }]);
      s.entries.forEach((e) => bodyLines(e.body, e.speaker ? [{ t: `${e.speaker}: ` }] : undefined));
    }
    if (s.files.length) p([{ t: `${s.fileLabel} (xem phụ lục): `, i: true }, { t: s.files.map((f) => f.name).join("; "), i: true }]);
  };

  for (const g of groups.filter((x) => !isC(x.part))) {
    if (g.part) {
      p([{ t: partLabel(g.part, m.week_from, m.week_to), b: true }], { keepNext: true });
      g.items.forEach(({ s, no }) => renderSection(s, s.layout === "list" ? null : no));
    } else {
      g.items.forEach(({ s }) => {
        looseNo++;
        p([{ t: `${roman(looseNo)}. ${s.title.toUpperCase()}`, b: true }], { keepNext: true });
        renderSection({ ...s, layout: s.layout === "inline" ? "block" : s.layout, title: "" } as ExSection, null);
      });
    }
  }

  p([{ t: "C. BIỂU QUYẾT VÀ KẾT LUẬN", b: true }], { keepNext: true });
  for (const g of groups.filter((x) => isC(x.part))) g.items.forEach(({ s }) => renderSection(s, null));
  const agree = m.vote_agree != null ? String(m.vote_agree) : SHORT_DOTS;
  const totalVote = m.vote_total != null ? String(m.vote_total) : SHORT_DOTS;
  const other = m.vote_agree != null ? m.vote_other || "không" : DOTS.slice(0, 40);
  p([{ t: `Số thành viên nhất trí: ${agree}/${totalVote}; ý kiến khác: ${other}.` }]);
  const [eh, em] = timeParts(m.end_time);
  p([{ t: `Cuộc họp kết thúc lúc ${eh} giờ ${em} phút cùng ngày. Thư ký trình bày lại nội dung để các thành viên dự họp xác nhận và ký tên.` }]);

  out.push({ table: "sign" });
  out.push({ runs: [{ t: "CÁC THÀNH VIÊN DỰ HỌP", b: true }], align: "center" });
  out.push({ table: "members" });

  const withFiles = d.sections.filter((s) => s.files.length);
  if (withFiles.length) {
    out.push({ pageBreak: true });
    out.push({ runs: [{ t: "PHỤ LỤC: MINH CHỨNG", b: true }], align: "center" });
    for (const s of withFiles) {
      p([{ t: s.title, b: true }], { keepNext: true });
      for (const f of s.files) {
        p([{ t: `- ${f.name}` }, { t: f.uploader ? ` (${f.uploader})` : "", i: true }]);
        if (f.image) out.push({ image: f });
      }
    }
    p([{ t: "Tệp gốc (ảnh lớn, clip, tài liệu) có đủ trong gói tải trọn gói.", i: true }]);
  }
  return out;
}

function signers(d: ExDoc) {
  const { active, absentIds, recorded } = present(d);
  return active.filter((x) => x.id !== d.chair?.id && x.id !== d.secretary?.id && (!recorded || !absentIds.has(x.id)));
}

// ------------------------------------------------------------------ HTML
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toHtml(d: ExDoc, opts: { autoPrint?: boolean } = {}): string {
  const blocks = buildBlocks(d);
  const body = blocks.map((b) => {
    if ("table" in b && b.table === "sign") {
      return `<table class="sign"><tr><td><b>THƯ KÝ</b><div class="gap"></div><b>${esc(d.secretary?.full_name ?? "")}</b></td><td><b>CHỦ TRÌ</b><div class="gap"></div><b>${esc(d.chair?.full_name ?? "")}</b></td></tr></table>`;
    }
    if ("table" in b && b.table === "members") {
      const rows = signers(d).map((x, i) => `<tr><td class="c">${i + 1}</td><td>${esc(x.full_name)}</td><td></td></tr>`).join("");
      return `<table class="mem"><tr><th>TT</th><th>GIÁO VIÊN DỰ HỌP</th><th>KÝ TÊN</th></tr>${rows}</table>`;
    }
    if ("pageBreak" in b) return `<div class="pb"></div>`;
    if ("image" in b) return `<p class="c"><img alt="${esc(b.image.name)}" src="data:${b.image.mime};base64,${b.image.image!.toString("base64")}"></p>`;
    const runs = b.runs.map((r) => {
      let t = esc(r.t);
      if (r.b) t = `<b>${t}</b>`;
      if (r.i) t = `<i>${t}</i>`;
      if (r.size && r.size !== 14) t = `<span style="font-size:${r.size}pt">${t}</span>`;
      return t;
    }).join("");
    return `<p class="${b.align === "center" ? "c" : "j"}${b.indent && b.align !== "center" ? " in" : ""}">${runs}</p>`;
  }).join("\n");

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.meeting.title)}</title>
<style>
body{font:14pt/1.35 "Times New Roman",serif;max-width:17cm;margin:0 auto;padding:1.5cm 1cm;color:#000;background:#fff}
p{margin:0 0 5pt}.c{text-align:center}.j{text-align:justify}.in{text-indent:1cm}
.head{width:100%;border-collapse:collapse;font-size:13pt;font-weight:bold;text-align:center;margin-bottom:12pt}
.head td{vertical-align:top;width:50%}
.sign{width:100%;margin-top:18pt;text-align:center}.sign td{width:50%;vertical-align:top}.gap{height:70pt}
.mem{width:100%;border-collapse:collapse;margin-top:6pt}.mem th,.mem td{border:1px solid #000;padding:6pt 8pt;height:22pt}
.mem td.c{width:1.2cm;text-align:center}.mem td:last-child{width:35%}
img{max-width:100%;max-height:9cm}.pb{page-break-before:always}
@media print{body{padding:0}@page{size:A4;margin:2cm 1.5cm 2cm 3cm}}
</style></head><body>
<table class="head"><tr><td>${esc(SCHOOL_NAME)}<br>${esc(TEAM_NAME)}</td><td>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập - Tự do - Hạnh phúc</td></tr></table>
${body}
${opts.autoPrint ? "<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>" : ""}
</body></html>`;
}

// ------------------------------------------------------------------ DOCX
const FONT = "Times New Roman";
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none };
const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const allLines = { top: line, bottom: line, left: line, right: line };
const spacing = { after: 100, line: 264, lineRule: LineRuleType.AUTO };

const tr = (r: Run) => new TextRun({ text: r.t, font: FONT, size: (r.size ?? 14) * 2, bold: r.b, italics: r.i });
const para = (runs: Run[], align: "center" | "justify" | "left" = "justify", indent = false, keepNext = false) =>
  new Paragraph({
    alignment: align === "center" ? AlignmentType.CENTER : align === "left" ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
    indent: indent ? { firstLine: 567 } : undefined,
    spacing, keepNext, children: runs.map(tr),
  });

export async function toDocx(d: ExDoc): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  children.push(new Table({
    width: { size: 10300, type: WidthType.DXA },
    columnWidths: [4700, 5600],
    indent: { size: -450, type: WidthType.DXA },
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, width: { size: 4700, type: WidthType.DXA }, children: [
        para([{ t: SCHOOL_NAME, b: true, size: 12 }], "center"), para([{ t: TEAM_NAME, b: true, size: 12 }], "center"),
      ] }),
      new TableCell({ borders: noBorders, width: { size: 5600, type: WidthType.DXA }, children: [
        para([{ t: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", b: true, size: 12 }], "center"),
        para([{ t: "Độc lập - Tự do - Hạnh phúc", b: true, size: 12 }], "center"),
      ] }),
    ] })],
  }));
  children.push(para([{ t: "" }], "center"));

  for (const b of buildBlocks(d)) {
    if ("table" in b && b.table === "sign") {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ children: [d.secretary, d.chair].map((mem, i) => new TableCell({
          borders: noBorders, width: { size: 50, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [tr({ t: i === 0 ? "THƯ KÝ" : "CHỦ TRÌ", b: true })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1300 }, children: [tr({ t: mem?.full_name ?? "", b: true })] }),
          ],
        })) })],
      }));
      children.push(para([{ t: "" }], "center"));
    } else if ("table" in b && b.table === "members") {
      const cell = (t: string, o: { b?: boolean; w: number; center?: boolean }) =>
        new TableCell({ borders: allLines, width: { size: o.w, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { before: 80, after: 80 }, children: [tr({ t, b: o.b })] })] });
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [cell("TT", { b: true, w: 10, center: true }), cell("GIÁO VIÊN DỰ HỌP", { b: true, w: 55, center: true }), cell("KÝ TÊN", { b: true, w: 35, center: true })] }),
          ...signers(d).map((x, i) => new TableRow({ children: [cell(String(i + 1), { w: 10, center: true }), cell(x.full_name, { w: 55 }), cell("", { w: 35 })] })),
        ],
      }));
    } else if ("pageBreak" in b) {
      children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    } else if ("image" in b) {
      try {
        const img = b.image.image!;
        const dim = imageSize(img);
        const w = Math.min(420, dim.width ?? 420);
        const h = Math.round(w * ((dim.height ?? 300) / (dim.width ?? 420)));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: dim.type === "png" ? "png" : "jpg", data: img, transformation: { width: w, height: Math.min(h, 520) } })] }));
      } catch { /* bỏ qua ảnh lỗi */ }
    } else {
      children.push(para(b.runs, b.align ?? "justify", !!b.indent && b.align !== "center", !!b.keepNext));
    }
  }

  const doc = new Document({
    creator: "Sinh hoạt chuyên môn",
    title: d.meeting.title,
    styles: { default: { document: { run: { font: FONT, size: 28 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
