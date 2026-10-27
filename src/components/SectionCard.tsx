"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Entry, FileRow, Profile, Section } from "@/lib/types";
import { acceptProposal, addEntry, deleteEntry, deleteFile, deleteSection, setAssignee, updateEntry } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { AI_ACTION_LABELS, BUCKET, EDITORS_LABELS, MAX_FILE_BYTES } from "@/lib/constants";
import { fmtDateTime, fmtSize, safeFileName } from "@/lib/format";

type EntryX = Entry & { author?: { full_name: string | null; email?: string } | null };
type FileX = FileRow & { uploader?: { full_name: string | null; email?: string } | null };

function who(p?: { full_name: string | null; email?: string } | null) {
  return p?.full_name || p?.email || "Thành viên đã rời tổ";
}

function allowed(mode: string, me: Profile, assignee: string | null) {
  const writer = me.role === "giao_vien" || me.role === "to_truong";
  if (!writer) return false;
  if (me.role === "to_truong") return true;
  if (mode === "all") return true;
  if (mode === "assigned") return assignee === me.id;
  return false;
}

export default function SectionCard({
  section, entries, files, urls, members, me, locked, meetingId,
}: {
  section: Section; entries: EntryX[]; files: FileX[]; urls: Record<string, string>;
  members: Profile[]; me: Profile; locked: boolean; meetingId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [aiBusy, setAiBusy] = useState("");
  const [usedAi, setUsedAi] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [preview, setPreview] = useState<FileX | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const leader = me.role === "to_truong";
  const canEntry = !locked && allowed(section.entry_editors, me, section.assignee_id);
  const canFile = !locked && section.files_mode !== "none" && allowed(section.file_editors, me, section.assignee_id);
  const accepted = entries.filter((e) => e.status === "accepted");
  const proposals = entries.filter((e) => e.status === "proposed");
  const assignee = members.find((m) => m.id === section.assignee_id);
  const needsAssignee = section.entry_editors === "assigned" || section.file_editors === "assigned";

  const refresh = () => router.refresh();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Có lỗi.");
      else { setMsg(""); after?.(); refresh(); }
    });

  async function aiPolish() {
    if (!text.trim()) return;
    setAiBusy("opinion"); setMsg("");
    try {
      const res = await fetch("/api/ai/opinion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: section.id, text }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa trả lời được.");
      setText(j.text); setUsedAi(true);
    } catch (e) { setMsg((e as Error).message); }
    setAiBusy("");
  }

  async function aiSection() {
    setAiBusy("section"); setMsg("");
    try {
      const res = await fetch("/api/ai/section", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: section.id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa trả lời được.");
      refresh();
    } catch (e) { setMsg((e as Error).message); }
    setAiBusy("");
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true); setMsg("");
    const supabase = createClient();
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) { setMsg(`"${file.name}" lớn hơn 50 MB nên chưa tải lên.`); continue; }
      const path = `evidence/${meetingId}/${section.id}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) { setMsg(`Không tải được "${file.name}": ${up.error.message}`); continue; }
      const { error } = await supabase.from("shcm_files").insert({
        kind: "minh_chung", meeting_id: meetingId, section_id: section.id, storage_path: path,
        file_name: file.name, mime_type: file.type || null, size_bytes: file.size, uploaded_by: me.id,
      });
      if (error) { await supabase.storage.from(BUCKET).remove([path]); setMsg(`Không ghi nhận được "${file.name}": ${error.message}`); }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    refresh();
  }

  const isImg = (f: FileX) => f.mime_type?.startsWith("image/");
  const isVid = (f: FileX) => f.mime_type?.startsWith("video/");
  const isPdf = (f: FileX) => f.mime_type === "application/pdf" || f.file_name.toLowerCase().endsWith(".pdf");
  const isDocx = (f: FileX) => f.file_name.toLowerCase().endsWith(".docx");

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{section.title}</h2>
          {section.hint && <p className="text-sm text-gray-500">{section.hint}</p>}
          <p className="mt-1 text-xs text-gray-400">
            Ghi ý kiến: {EDITORS_LABELS[section.entry_editors]}
            {section.files_mode !== "none" ? ` · Tải tệp: ${EDITORS_LABELS[section.file_editors]}` : ""}
            {needsAssignee ? ` · Phụ trách: ${assignee ? who(assignee) : "chưa phân công"}` : ""}
          </p>
        </div>
        {leader && !locked && (
          <div className="flex items-center gap-2">
            {needsAssignee && (
              <select className="input !w-auto !py-1 text-sm" value={section.assignee_id ?? ""} disabled={pending}
                onChange={(e) => run(() => setAssignee(section.id, e.target.value || null))}>
                <option value="">Chưa phân công</option>
                {members.filter((m) => m.role === "giao_vien" || m.role === "to_truong").map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            )}
            {!["nhiem_vu", "viec_chung", "ket_luan"].includes(section.key) && (
              <button className="btn btn-sm btn-danger" onClick={() => confirm("Xóa đề mục này cùng nội dung bên trong?") && run(() => deleteSection(section.id))}>Xóa mục</button>
            )}
          </div>
        )}
      </div>

      {/* Tệp */}
      {section.files_mode !== "none" && (
        <div className="mt-3">
          <p className="text-sm font-medium text-gray-700">{section.file_label || (section.files_mode === "viewer" ? "Tệp" : "Minh chứng")}</p>
          {files.length === 0 && <p className="text-sm text-gray-400">Chưa có tệp.</p>}
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {files.map((f) => (
              <div key={f.id} className="rounded-lg border border-[var(--line)] p-2 text-sm">
                {isImg(f) && urls[f.id] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[f.id]} alt={f.file_name} className="mb-2 max-h-40 w-full rounded object-cover" />
                )}
                {isVid(f) && urls[f.id] && <video src={urls[f.id]} controls preload="metadata" className="mb-2 max-h-48 w-full rounded" />}
                <div className="break-words font-medium">{f.file_name}</div>
                <div className="text-xs text-gray-500">{who(f.uploader)} · {fmtDateTime(f.created_at)} {fmtSize(f.size_bytes) && `· ${fmtSize(f.size_bytes)}`}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(isPdf(f) || isDocx(f)) && <button className="btn btn-sm" onClick={() => setPreview(f)}>Xem</button>}
                  {urls[f.id] && <a className="btn btn-sm" href={urls[f.id]} target="_blank" rel="noreferrer">Mở / tải</a>}
                  {!locked && (leader || f.uploaded_by === me.id) && (
                    <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => confirm("Xóa tệp này?") && run(() => deleteFile(f.id, f.storage_path))}>Xóa</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canFile && (
            <div className="mt-2">
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)}
                accept={section.files_mode === "viewer" ? ".pdf,.docx,.doc,.pptx,image/*" : undefined} />
              <button className="btn btn-sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? "Đang tải lên…" : "+ Tải tệp lên"}
              </button>
              <span className="ml-2 text-xs text-gray-400">Tệp, ảnh hoặc clip ngắn, mỗi tệp tối đa 50 MB</span>
            </div>
          )}
        </div>
      )}

      {/* Ý kiến */}
      <div className="mt-3 grid gap-2">
        {accepted.map((e) => (
          <div key={e.id} className="rounded-lg bg-[#f8f6ef] p-3 text-sm">
            {editing === e.id ? (
              <>
                <textarea className="input" rows={4} value={editText} onChange={(x) => setEditText(x.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => updateEntry(e.id, editText), () => setEditing(null))}>Lưu</button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}>Hủy</button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{e.body}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {who(e.author)} · {fmtDateTime(e.created_at)}
                  {e.source === "ai_assisted" && <span className="badge badge-ai ml-2">có AI hỗ trợ soạn</span>}
                  {e.source === "ke_hoach" && <span className="badge badge-ai ml-2">theo kế hoạch năm</span>}
                  {e.source === "van_ban_moi" && <span className="badge badge-ai ml-2">theo văn bản mới</span>}
                  {e.source === "ai_summary" && <span className="badge badge-ai ml-2">AI tổng hợp, tổ trưởng đã nhận</span>}
                  {!locked && (leader || e.author_id === me.id) && (
                    <>
                      <button className="ml-3 underline" onClick={() => { setEditing(e.id); setEditText(e.body); }}>Sửa</button>
                      <button className="ml-2 underline" disabled={pending} onClick={() => confirm("Xóa ý kiến này?") && run(() => deleteEntry(e.id))}>Xóa</button>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        ))}
        {accepted.length === 0 && !canEntry && <p className="text-sm text-gray-400">Chưa có nội dung.</p>}
      </div>

      {/* Đề xuất của AI: chỉ tổ trưởng thấy */}
      {leader && proposals.length > 0 && (
        <div className="mt-3 grid gap-2">
          {proposals.map((p) => <Proposal key={p.id} entry={p} locked={locked} pending={pending} run={run} />)}
        </div>
      )}

      {canEntry && (
        <div className="mt-3">
          <textarea className="input" rows={3} placeholder={section.entry_editors === "leader" ? "Nội dung do tổ trưởng ghi…" : "Ghi ý kiến của bạn…"}
            value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setUsedAi(false); }} maxLength={8000} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending || !text.trim()}
              onClick={() => run(() => addEntry(section.id, text, usedAi ? "ai_assisted" : "manual"), () => { setText(""); setUsedAi(false); })}>Gửi ý kiến</button>
            <button className="btn btn-sm" disabled={!text.trim() || !!aiBusy} onClick={aiPolish}
              title={text.trim() ? "" : "Viết ý kiến trước, AI mới hỗ trợ hoàn chỉnh được"}>
              {aiBusy === "opinion" ? "AI đang soạn…" : "AI hỗ trợ ý kiến hoàn chỉnh"}
            </button>
            {leader && section.ai_action !== "none" && AI_ACTION_LABELS[section.ai_action] && (
              <button className="btn btn-sm" disabled={!!aiBusy} onClick={aiSection}>
                {aiBusy === "section" ? "AI đang tổng hợp…" : AI_ACTION_LABELS[section.ai_action]}
              </button>
            )}
          </div>
        </div>
      )}
      {!canEntry && leader && !locked && section.ai_action !== "none" && AI_ACTION_LABELS[section.ai_action] && (
        <div className="mt-3">
          <button className="btn btn-sm" disabled={!!aiBusy} onClick={aiSection}>
            {aiBusy === "section" ? "AI đang tổng hợp…" : AI_ACTION_LABELS[section.ai_action]}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2">
              <b className="min-w-0 flex-1 truncate text-sm">{preview.file_name}</b>
              <button className="btn btn-sm" onClick={() => setPreview(null)}>Đóng</button>
            </div>
            {isPdf(preview)
              ? <iframe src={urls[preview.id]} className="w-full flex-1" title={preview.file_name} />
              : <iframe src={`/api/files/${preview.id}/preview`} sandbox="" className="w-full flex-1" title={preview.file_name} />}
          </div>
        </div>
      )}
    </section>
  );
}

function Proposal({ entry, locked, pending, run }: {
  entry: EntryX; locked: boolean; pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void;
}) {
  const [body, setBody] = useState(entry.body);
  return (
    <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50 p-3 text-sm">
      <p className="mb-1 text-xs font-medium text-violet-800">Đề xuất của AI — chỉ tổ trưởng thấy, chưa vào biên bản</p>
      <textarea className="input" rows={Math.min(12, Math.max(3, body.split("\n").length + 1))} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} />
      {!locked && (
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => acceptProposal(entry.id, body))}>Nhận vào biên bản</button>
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => deleteEntry(entry.id))}>Bỏ đề xuất</button>
        </div>
      )}
    </div>
  );
}
