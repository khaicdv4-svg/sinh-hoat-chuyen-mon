"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createMeeting } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { AI_ACTION_LABELS, BUCKET, EDITORS_LABELS, FILES_MODE_LABELS } from "@/lib/constants";
import { safeFileName, slugify } from "@/lib/format";
import type { Template, TemplateSection } from "@/lib/types";

const blank = (): TemplateSection => ({ key: "", title: "", hint: "", entry_editors: "all", file_editors: "leader", files_mode: "none", file_label: "", ai_action: "none" });

export default function NewMeeting({ me, templates, meetings }: { me: string; templates: Template[]; meetings: { id: string; title: string }[] }) {
  const router = useRouter();
  const fileIn = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("14:00");
  const [place, setPlace] = useState("Phòng họp lầu 1");
  const [desc, setDesc] = useState("");
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [saveTpl, setSaveTpl] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const pickTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSections(t.sections.map((s) => ({ ...s })));
    if (!title) setTitle(`Biên bản ${t.name.toLowerCase()}`);
  };

  async function copyFrom(id: string) {
    if (!id) return;
    const supabase = createClient();
    const { data } = await supabase.from("shcm_sections").select("*").eq("meeting_id", id).order("position");
    setSections((data ?? []).map((s) => ({ key: s.key, title: s.title, hint: s.hint, entry_editors: s.entry_editors, file_editors: s.file_editors, files_mode: s.files_mode, file_label: s.file_label, ai_action: s.ai_action })));
  }

  async function ai() {
    setBusy("ai"); setErr("");
    try {
      let fileId: string | undefined;
      const f = fileIn.current?.files?.[0];
      if (f) {
        const supabase = createClient();
        const path = `leader/mau_bien_ban/${crypto.randomUUID().slice(0, 8)}-${safeFileName(f.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
        if (up.error) throw new Error(up.error.message);
        const { data, error } = await supabase.from("shcm_files").insert({ kind: "mau_bien_ban", storage_path: path, file_name: f.name, mime_type: f.type || null, size_bytes: f.size, uploaded_by: me }).select("id").single();
        if (error) throw new Error(error.message);
        fileId = data.id;
      }
      const res = await fetch("/api/ai/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: desc, fileId }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa trả lời được.");
      setSections(j.muc);
      if (!title) setTitle(j.ten);
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  const patch = (i: number, p: Partial<TemplateSection>) => setSections((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function create() {
    setBusy("create"); setErr("");
    const secs = sections.filter((s) => s.title.trim()).map((s, i) => ({ ...s, key: slugify(s.key || s.title) || `muc_${i + 1}` }));
    const seen = new Set<string>();
    secs.forEach((s) => { while (seen.has(s.key)) s.key += "_2"; seen.add(s.key); });
    const r = await createMeeting({
      title, meeting_date: date || null, meeting_time: time || null, place: place || null, sections: secs,
      saveAsTemplate: saveTpl ? { name: title } : null,
    });
    if (!r.ok) { setErr(r.error); setBusy(""); return; }
    router.push(`/bien-ban/${r.id}`);
  }

  return (
    <div className="grid gap-5">
      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <div className="sm:col-span-3 font-medium">1. Chọn cách dựng đề mục</div>
        <label className="text-sm">Từ mẫu có sẵn
          <select className="input mt-1" defaultValue="" onChange={(e) => pickTemplate(e.target.value)}>
            <option value="">Chọn mẫu…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Sao từ biên bản đã có
          <select className="input mt-1" defaultValue="" onChange={(e) => copyFrom(e.target.value)}>
            <option value="">Chọn biên bản…</option>
            {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        <div className="sm:col-span-3 border-t border-[var(--line)] pt-3">
          <label className="text-sm">Hoặc mô tả để AI dựng (có thể kèm tệp mẫu của trường)
            <textarea className="input mt-1" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: biên bản họp thống nhất đề kiểm tra giữa học kì I môn Toán, có ma trận, đề, đáp án, ý kiến từng giáo viên và phần thống nhất sửa." />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={fileIn} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" className="text-sm" />
            <button className="btn btn-sm" disabled={busy === "ai" || (!desc.trim() && !fileIn.current?.files?.length)} onClick={ai}>{busy === "ai" ? "AI đang dựng…" : "AI dựng đề mục"}</button>
          </div>
        </div>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-4 font-medium">2. Thông tin biên bản</div>
        <label className="text-sm sm:col-span-4">Tên biên bản<input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Biên bản thống nhất đề kiểm tra giữa học kì I" /></label>
        <label className="text-sm">Ngày họp<input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Giờ<input type="time" className="input mt-1" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Địa điểm<input className="input mt-1" value={place} onChange={(e) => setPlace(e.target.value)} /></label>
      </div>

      <div className="card p-4">
        <div className="font-medium">3. Các đề mục ({sections.length})</div>
        <div className="mt-3 grid gap-3">
          {sections.map((s, i) => (
            <div key={i} className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex gap-2">
                <input className="input" placeholder="Tên đề mục" value={s.title} onChange={(e) => patch(i, { title: e.target.value })} />
                <button className="btn btn-sm btn-danger" onClick={() => setSections((x) => x.filter((_, k) => k !== i))}>Xóa</button>
              </div>
              <input className="input mt-2 text-sm" placeholder="Gợi ý cho người nhập (không bắt buộc)" value={s.hint ?? ""} onChange={(e) => patch(i, { hint: e.target.value })} />
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                <label>Ai ghi ý kiến<select className="input mt-1" value={s.entry_editors} onChange={(e) => patch(i, { entry_editors: e.target.value as TemplateSection["entry_editors"] })}>{Object.entries(EDITORS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Tệp<select className="input mt-1" value={s.files_mode} onChange={(e) => patch(i, { files_mode: e.target.value as TemplateSection["files_mode"] })}>{Object.entries(FILES_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Ai tải tệp<select className="input mt-1" value={s.file_editors} disabled={s.files_mode === "none"} onChange={(e) => patch(i, { file_editors: e.target.value as TemplateSection["file_editors"] })}>{Object.entries(EDITORS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>AI cho tổ trưởng<select className="input mt-1" value={s.ai_action ?? "none"} onChange={(e) => patch(i, { ai_action: e.target.value })}><option value="none">Không</option>{Object.entries(AI_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-sm mt-3" onClick={() => setSections((x) => [...x, blank()])}>+ Thêm đề mục</button>
      </div>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveTpl} onChange={(e) => setSaveTpl(e.target.checked)} /> Lưu bộ đề mục này thành mẫu dùng lại</label>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div><button className="btn btn-primary" disabled={busy === "create" || !title.trim() || !sections.some((s) => s.title.trim())} onClick={create}>{busy === "create" ? "Đang tạo…" : "Tạo biên bản"}</button></div>
    </div>
  );
}
