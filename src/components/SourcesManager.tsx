"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, MAX_FILE_BYTES } from "@/lib/constants";
import { fmtDateTime, fmtSize, safeFileName } from "@/lib/format";
import { addTextSource, deleteSource, saveSkill, setSourceEnabled } from "@/app/nguon-tu-lieu/actions";

export type SourceRow = {
  id: string; kind: "ke_hoach" | "van_ban" | "lich"; title: string; url: string | null; note: string | null;
  file_name: string | null; size_bytes: number | null; enabled: boolean; created_at: string; chars: number;
};

const KINDS: { kind: SourceRow["kind"]; title: string; hint: string; accept: string; addHint: string }[] = [
  {
    kind: "ke_hoach", title: "1. Kế hoạch",
    hint: "Kế hoạch năm học, kế hoạch tổ, kế hoạch SHCM, kế hoạch NCBH, phân phối chương trình.",
    accept: ".docx,.pdf,.txt,.md", addHint: "Tải kế hoạch (Word, PDF) hoặc dán ghi chú.",
  },
  {
    kind: "van_ban", title: "2. Văn bản, công văn mới",
    hint: "Công văn, thông tư, quyết định, hướng dẫn mới của Bộ, Sở, phường và nhà trường.",
    accept: ".docx,.pdf,.txt,.md", addHint: "Tải văn bản hoặc dán nội dung cần AI nhớ.",
  },
  {
    kind: "lich", title: "3. Lịch hoạt động và Drive",
    hint: "Lịch công tác, lịch Google Calendar (xuất file .ics rồi tải lên), liên kết thư mục Drive.",
    accept: ".ics,.docx,.pdf,.txt,.csv,.md", addHint: "Tải file .ics/.csv/.docx hoặc thêm liên kết Drive kèm ghi chú.",
  },
];

export default function SourcesManager({ rows, me, skill }: { rows: SourceRow[]; me: string; skill: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState<SourceRow["kind"] | "">("");
  const [f, setF] = useState({ title: "", url: "", note: "" });
  const [skillText, setSkillText] = useState(skill);
  const [skillMsg, setSkillMsg] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const skillFile = useRef<HTMLInputElement>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Có lỗi.");
      else { setMsg(""); after?.(); router.refresh(); }
    });

  async function upload(kind: SourceRow["kind"], list: FileList | null) {
    if (!list?.length) return;
    setBusy(kind); setMsg("");
    const supabase = createClient();
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) { setMsg(`"${file.name}" lớn hơn 50 MB nên chưa tải lên.`); continue; }
      const path = `leader/nguon/${kind}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) { setMsg(`Không tải được "${file.name}": ${up.error.message}`); continue; }
      const { data, error } = await supabase.from("shcm_sources")
        .insert({ kind, title: file.name.replace(/\.[^.]+$/, ""), file_name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size, created_by: me })
        .select("id").single();
      if (error || !data) { await supabase.storage.from(BUCKET).remove([path]); setMsg(`Không ghi nhận được "${file.name}": ${error?.message}`); continue; }
      const res = await fetch("/api/sources/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: data.id }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg(`"${file.name}" đã lưu nhưng AI chưa đọc được: ${j.error ?? res.status}`); }
    }
    setBusy("");
    if (inputs.current[kind]) inputs.current[kind]!.value = "";
    router.refresh();
  }

  async function pickSkillFile(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name)) { setSkillMsg("Chọn tệp .md hoặc .txt. Với Word, thầy mở ra rồi dán nội dung vào ô."); return; }
    setSkillText(await file.text());
    setSkillMsg("Đã nạp nội dung tệp. Bấm Lưu kỹ năng để dùng.");
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {KINDS.map((k) => {
          const list = rows.filter((r) => r.kind === k.kind);
          return (
            <section key={k.kind} className="card flex flex-col p-4">
              <h2 className="font-bold text-[var(--brand-dark)]">{k.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{k.hint}</p>
              <div className="well mt-3 grid max-h-96 min-h-24 gap-2 overflow-auto p-2">
                {list.length === 0 && <p className="p-2 text-sm text-gray-500">Chưa có nguồn nào.</p>}
                {list.map((r) => (
                  <div key={r.id} className={`card p-3 text-sm ${r.enabled ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <label className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-semibold" title="AI có dùng nguồn này hay không">
                        <input type="checkbox" checked={r.enabled} disabled={pending} onChange={(e) => act(() => setSourceEnabled(r.id, e.target.checked))} />
                        AI dùng
                      </label>
                      <button className="ml-auto text-xs font-semibold text-red-700 underline" disabled={pending}
                        onClick={() => confirm(`Xóa nguồn "${r.title}"?`) && act(() => deleteSource(r.id))}>Xóa</button>
                    </div>
                    <p className="mt-1 break-words font-semibold">{r.title}</p>
                    {r.url && <a className="break-all text-xs text-[var(--brand)] underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>}
                    {r.note && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{r.note.length > 200 ? r.note.slice(0, 200) + "…" : r.note}</p>}
                    <p className="mt-1 text-xs text-gray-500">
                      {r.file_name ? `${r.file_name}${r.size_bytes ? ` · ${fmtSize(r.size_bytes)}` : ""} · ` : ""}
                      {r.file_name ? (r.chars ? `AI đã đọc ${r.chars.toLocaleString("vi-VN")} ký tự` : "AI chưa đọc được chữ") : ""}
                      {r.file_name ? " · " : ""}{fmtDateTime(r.created_at)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input ref={(el) => { inputs.current[k.kind] = el; }} type="file" multiple accept={k.accept} className="hidden" onChange={(e) => upload(k.kind, e.target.files)} />
                <button className="btn btn-primary btn-sm" disabled={busy === k.kind} onClick={() => inputs.current[k.kind]?.click()}>
                  {busy === k.kind ? "Đang tải và đọc…" : "+ Tải tệp"}
                </button>
                <button className="btn btn-sm" onClick={() => { setAdding(adding === k.kind ? "" : k.kind); setF({ title: "", url: "", note: "" }); }}>+ Liên kết / ghi chú</button>
              </div>
              <p className="mt-1 text-xs text-gray-500">{k.addHint}</p>

              {adding === k.kind && (
                <div className="well mt-3 grid gap-2 p-3">
                  <input className="input" placeholder="Tên nguồn" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                  <input className="input" placeholder="Liên kết (Drive, trang web), nếu có" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
                  <textarea className="input" rows={4} placeholder="Ghi chú hoặc dán nội dung để AI tham khảo" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" disabled={pending || !f.title.trim()}
                      onClick={() => act(() => addTextSource(k.kind, f.title, f.url, f.note), () => setAdding(""))}>Thêm</button>
                    <button className="btn btn-sm" onClick={() => setAdding("")}>Hủy</button>
                  </div>
                  {k.kind === "lich" && <p className="text-xs text-gray-500">AI không tự mở được thư mục Drive. Muốn AI đọc nội dung, thầy tải tệp lên hoặc dán nội dung vào ô ghi chú.</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}

      <section className="card p-4">
        <h2 className="font-bold text-[var(--brand-dark)]">Kỹ năng viết cho AI</h2>
        <p className="mt-1 text-sm text-gray-600">
          Hướng dẫn cách viết biên bản, giọng văn, cấu trúc từng mục. AI làm theo nội dung này mỗi lần soạn. Thầy dán nội dung hoặc nạp tệp .md/.txt.
        </p>
        <textarea className="input mt-3" rows={10} value={skillText} onChange={(e) => setSkillText(e.target.value)} maxLength={30000}
          placeholder="Ví dụ: Biên bản viết ngắn, mỗi ý một dòng, không dùng từ sáo rỗng, không xếp loại tiết dạy…" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={skillFile} type="file" accept=".md,.txt" className="hidden" onChange={(e) => pickSkillFile(e.target.files?.[0])} />
          <button className="btn btn-sm" onClick={() => skillFile.current?.click()}>Nạp từ tệp</button>
          <button className="btn btn-primary btn-sm" disabled={pending}
            onClick={() => act(() => saveSkill(skillText), () => setSkillMsg("Đã lưu kỹ năng."))}>Lưu kỹ năng</button>
          <span className="text-xs text-gray-500">{skillText.length.toLocaleString("vi-VN")}/30.000 ký tự</span>
          {skillMsg && <span className="text-sm text-green-800">{skillMsg}</span>}
        </div>
      </section>
    </div>
  );
}
