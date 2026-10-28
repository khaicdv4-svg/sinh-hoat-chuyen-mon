"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Entry, FileRow, Member, Profile, Section } from "@/lib/types";
import {
  acceptProposal, addEntry, addOpinion, decideOpinion, deleteEntry, deleteFile, deleteSection, renameSection, setAssignee, updateEntry,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { AI_ACTION_LABELS, BUCKET, EDITORS_LABELS, MAX_FILE_BYTES } from "@/lib/constants";
import { fmtDateTime, fmtSize, memberName, safeFileName } from "@/lib/format";

type EntryX = Entry & { author?: { full_name: string | null; email?: string } | null };
type FileX = FileRow & { uploader?: { full_name: string | null; email?: string } | null };
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void;

const PROTECTED = ["danh_gia_cm", "danh_gia_cn", "danh_gia_nv", "chuyen_tiep", "chuong_trinh", "nhiem_vu", "van_ban", "cd_noi_dung", "chia_se", "phan_cong", "ket_luan"];

function who(p?: { full_name: string | null; email?: string } | null) {
  return p?.full_name || p?.email || "Thành viên đã rời tổ";
}

function allowed(mode: string, me: Profile, assignee: string | null, secretary: boolean) {
  const writer = me.role === "giao_vien" || me.role === "to_truong";
  if (!writer) return false;
  if (me.role === "to_truong" || secretary) return true;
  if (mode === "all") return true;
  if (mode === "assigned") return assignee === me.id;
  return false;
}

export default function SectionCard({
  no, section, entries, files, urls, profiles, members, myMember, me, secretary, locked, meetingId,
}: {
  no: number | null; section: Section; entries: EntryX[]; files: FileX[]; urls: Record<string, string>;
  profiles: Profile[]; members: Member[]; myMember: Member | null; me: Profile; secretary: boolean; locked: boolean; meetingId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [aiBusy, setAiBusy] = useState("");
  const [usedAi, setUsedAi] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [preview, setPreview] = useState<FileX | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const leader = me.role === "to_truong";
  const recorder = leader || secretary; // được ghi thay người khác
  const defaultSpeaker = section.entry_editors === "leader" ? "" : myMember?.id ?? "";
  const [speaker, setSpeaker] = useState(defaultSpeaker);

  const canEntry = !locked && allowed(section.entry_editors, me, section.assignee_id, secretary);
  const canFile = !locked && section.files_mode !== "none" && allowed(section.file_editors, me, section.assignee_id, secretary);
  const accepted = entries.filter((e) => (e.kind !== "y_kien" && e.status === "accepted") || (e.kind === "y_kien" && e.status === "merged"));
  const opAccepted = entries.filter((e) => e.kind === "y_kien" && e.status === "accepted");
  const opPending = entries.filter((e) => e.kind === "y_kien" && e.status === "pending");
  const opDismissed = entries.filter((e) => e.kind === "y_kien" && e.status === "dismissed");
  const canOpinion = !locked && section.allow_opinions && (me.role === "giao_vien" || me.role === "to_truong");
  const opLabel = section.opinion_label || "Ý kiến";
  const [otext, setOtext] = useState("");
  const [oSpeaker, setOSpeaker] = useState(myMember?.id ?? "");
  const [oAi, setOAi] = useState(false);
  const proposals = entries.filter((e) => e.status === "proposed" && e.kind !== "y_kien");
  const assignee = profiles.find((m) => m.id === section.assignee_id);
  const needsAssignee = section.entry_editors === "assigned" || section.file_editors === "assigned";
  const memberById = (id: string | null) => members.find((m) => m.id === id) ?? null;
  const activeMembers = members.filter((m) => m.active);

  const refresh = () => router.refresh();
  const run: Run = (fn, after) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Có lỗi.");
      else { setMsg(""); after?.(); refresh(); }
    });

  async function aiPolish(kind: "content" | "opinion" = "content") {
    const src = kind === "opinion" ? otext : text;
    if (!src.trim()) return;
    setAiBusy("opinion"); setMsg("");
    try {
      const sp = kind === "opinion" ? (recorder ? oSpeaker || null : myMember?.id ?? null) : recorder ? speaker || null : myMember?.id ?? null;
      const res = await fetch("/api/ai/opinion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: section.id, text: src, speakerId: sp }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa trả lời được.");
      if (kind === "opinion") { setOtext(j.text); setOAi(true); } else { setText(j.text); setUsedAi(true); }
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

  const speakerSelect = (value: string, onChange: (v: string) => void) => (
    <select className="input !w-auto !py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Nội dung chung (không ghi tên)</option>
      {activeMembers.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
    </select>
  );

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap gap-2">
              <input className="input !w-auto min-w-72 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => renameSection(section.id, title, section.hint), () => setRenaming(false))}>Lưu</button>
              <button className="btn btn-sm" onClick={() => { setRenaming(false); setTitle(section.title); }}>Hủy</button>
            </div>
          ) : (
            <h3 className="font-semibold">
              {no ? `${no}. ` : ""}{section.title}
              {leader && !locked && <button className="ml-2 text-xs font-normal text-gray-400 underline" onClick={() => setRenaming(true)}>đổi tên</button>}
            </h3>
          )}
          {section.hint && <p className="text-sm text-gray-500">{section.hint}</p>}
          <p className="mt-1 text-xs text-gray-400">
            Ghi nội dung: {EDITORS_LABELS[section.entry_editors]}{section.entry_editors !== "all" ? ", thư ký" : ""}
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
                {profiles.filter((m) => m.role === "giao_vien" || m.role === "to_truong").map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            )}
            {!PROTECTED.includes(section.key) && (
              <button className="btn btn-sm btn-danger" onClick={() => confirm("Xóa đề mục này cùng nội dung bên trong?") && run(() => deleteSection(section.id))}>Xóa mục</button>
            )}
          </div>
        )}
      </div>

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

      <div className="mt-3 grid gap-2">
        {accepted.map((e, i) => {
          const sp = memberById(e.speaker_id);
          const recordedBy = sp && sp.user_id !== e.author_id ? ` · ${who(e.author)} ghi` : "";
          const mine = e.author_id === me.id;
          return (
            <div key={e.id} className="rounded-lg bg-[#f8f6ef] p-3 text-sm">
              {editing === e.id ? (
                <>
                  {recorder && <div className="mb-2">{speakerSelect(editSpeaker, setEditSpeaker)}</div>}
                  <textarea className="input" rows={4} value={editText} onChange={(x) => setEditText(x.target.value)} />
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => updateEntry(e.id, editText, recorder ? editSpeaker : undefined), () => setEditing(null))}>Lưu</button>
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>Hủy</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">
                    {section.layout === "list" && <span>{i + 1}. </span>}
                    {sp && e.kind !== "y_kien" && <b>{memberName(sp)}: </b>}
                    {e.body}
                    {e.kind === "y_kien" && <i className="text-gray-600"> (ý kiến bổ sung của {sp ? memberName(sp) : who(e.author)})</i>}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {sp ? "" : `${who(e.author)} · `}{fmtDateTime(e.created_at)}{recordedBy}
                    {e.source === "ai_assisted" && <span className="badge badge-ai ml-2">có AI hỗ trợ soạn</span>}
                    {e.source === "ke_hoach" && <span className="badge badge-ai ml-2">theo kế hoạch năm</span>}
                    {e.source === "van_ban_moi" && <span className="badge badge-ai ml-2">theo văn bản mới</span>}
                    {e.source === "ai_summary" && <span className="badge badge-ai ml-2">AI tổng hợp, tổ trưởng đã nhận</span>}
                    {e.source === "nhap_file" && <span className="badge badge-ai ml-2">nhập từ tệp</span>}
                    {e.kind === "y_kien" && <span className="badge badge-ai ml-2">ý kiến đã bổ sung vào nội dung</span>}
                    {e.kind === "y_kien" && leader && !locked && (
                      <button className="ml-3 underline" disabled={pending} onClick={() => run(() => decideOpinion(e.id, "pending"))}>Trả về chờ xử lý</button>
                    )}
                    {!locked && (leader || (mine && e.kind !== "y_kien")) && (
                      <>
                        <button className="ml-3 underline" onClick={() => { setEditing(e.id); setEditText(e.body); setEditSpeaker(e.speaker_id ?? ""); }}>Sửa</button>
                        <button className="ml-2 underline" disabled={pending} onClick={() => confirm("Xóa nội dung này?") && run(() => deleteEntry(e.id))}>Xóa</button>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          );
        })}
        {accepted.length === 0 && !canEntry && <p className="text-sm text-gray-400">Chưa có nội dung.</p>}
      </div>

      {leader && proposals.length > 0 && (
        <div className="mt-3 grid gap-2">
          {proposals.map((p) => <Proposal key={p.id} entry={p} speaker={memberById(p.speaker_id)} locked={locked} pending={pending} run={run} />)}
        </div>
      )}

      {canEntry && (
        <div className="mt-3">
          {recorder && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              Người phát biểu: {speakerSelect(speaker, setSpeaker)}
            </div>
          )}
          <textarea className="input" rows={3}
            placeholder={recorder && speaker && speaker !== myMember?.id ? `Ghi lại ý kiến của ${memberName(memberById(speaker))}…` : section.entry_editors === "leader" ? "Nội dung của mục này…" : "Ghi ý kiến của bạn…"}
            value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setUsedAi(false); }} maxLength={8000} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending || !text.trim()}
              onClick={() => run(() => addEntry(section.id, text, usedAi ? "ai_assisted" : "manual", recorder ? speaker || null : myMember?.id ?? null), () => { setText(""); setUsedAi(false); })}>
              Gửi
            </button>
            <button className="btn btn-sm" disabled={!text.trim() || !!aiBusy} onClick={() => aiPolish("content")}
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

      {section.allow_opinions && (opAccepted.length > 0 || opPending.length > 0 || opDismissed.length > 0 || canOpinion) && (
        <div className="mt-4 border-t border-dashed border-[var(--line)] pt-3">
          <p className="text-sm font-semibold text-gray-700">{opLabel}</p>
          <div className="mt-2 grid gap-2">
            {opAccepted.map((e) => {
              const sp = memberById(e.speaker_id);
              return (
                <div key={e.id} className="rounded-lg bg-[#f8f6ef] p-3 text-sm">
                  {editing === e.id ? (
                    <>
                      <textarea className="input" rows={3} value={editText} onChange={(x) => setEditText(x.target.value)} />
                      <div className="mt-2 flex gap-2">
                        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => updateEntry(e.id, editText), () => setEditing(null))}>Lưu</button>
                        <button className="btn btn-sm" onClick={() => setEditing(null)}>Hủy</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{sp ? <b>{memberName(sp)}: </b> : <b>{who(e.author)}: </b>}{e.body}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Ghi nhận trong biên bản · {fmtDateTime(e.created_at)}
                        {e.source === "ai_assisted" && <span className="badge badge-ai ml-2">có AI hỗ trợ soạn</span>}
                        {!locked && (leader || secretary) && (
                          <>
                            <button className="ml-3 underline" onClick={() => { setEditing(e.id); setEditText(e.body); }}>Sửa</button>
                            <button className="ml-2 underline" disabled={pending} onClick={() => confirm("Xóa ý kiến này?") && run(() => deleteEntry(e.id))}>Xóa</button>
                          </>
                        )}
                        {leader && !locked && (
                          <button className="ml-2 underline" disabled={pending} onClick={() => run(() => decideOpinion(e.id, "merged"))}>Chuyển thành bổ sung nội dung</button>
                        )}
                      </p>
                    </>
                  )}
                </div>
              );
            })}

            {opPending.map((e) => {
              const sp = memberById(e.speaker_id);
              const mine = e.author_id === me.id;
              return (
                <div key={e.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    {editing === e.id ? (
                      <>
                        <textarea className="input" rows={3} value={editText} onChange={(x) => setEditText(x.target.value)} />
                        <div className="mt-2 flex gap-2">
                          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => updateEntry(e.id, editText), () => setEditing(null))}>Lưu</button>
                          <button className="btn btn-sm" onClick={() => setEditing(null)}>Hủy</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap">{sp ? <b>{memberName(sp)}: </b> : <b>{who(e.author)}: </b>}{e.body}</p>
                        <p className="mt-1 text-xs text-amber-800">
                          Chờ tổ trưởng xem · {fmtDateTime(e.created_at)}
                          {e.source === "ai_assisted" && <span className="badge badge-ai ml-2">có AI hỗ trợ soạn</span>}
                          {!locked && (leader || mine) && (
                            <>
                              <button className="ml-3 underline" onClick={() => { setEditing(e.id); setEditText(e.body); }}>Sửa</button>
                              <button className="ml-2 underline" disabled={pending} onClick={() => confirm("Xóa ý kiến này?") && run(() => deleteEntry(e.id))}>Xóa</button>
                            </>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                  {leader && !locked && editing !== e.id && (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-primary btn-sm" disabled={pending} title="Đưa vào nội dung của mục, ghi kèm (ý kiến bổ sung của …)" onClick={() => run(() => decideOpinion(e.id, "merged"))}>Bổ sung nội dung</button>
                      <button className="btn btn-sm" disabled={pending} title="Hiện ở phần ý kiến của biên bản" onClick={() => run(() => decideOpinion(e.id, "accepted"))}>Ghi nhận ý kiến</button>
                      <button className="btn btn-sm" disabled={pending} title="Không đưa vào biên bản" onClick={() => run(() => decideOpinion(e.id, "dismissed"))}>Xem xét lại</button>
                    </div>
                  )}
                </div>
              );
            })}

            {opDismissed.map((e) => {
              const sp = memberById(e.speaker_id);
              return (
                <div key={e.id} className="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500">
                  <p className="whitespace-pre-wrap">{sp ? <b>{memberName(sp)}: </b> : <b>{who(e.author)}: </b>}{e.body}</p>
                  <p className="mt-1 text-xs">
                    Tổ trưởng đang xem xét lại, chưa đưa vào biên bản
                    {!locked && leader && (
                      <button className="ml-3 underline" disabled={pending} onClick={() => run(() => decideOpinion(e.id, "pending"))}>Khôi phục</button>
                    )}
                    {!locked && (leader || e.author_id === me.id) && (
                      <button className="ml-2 underline" disabled={pending} onClick={() => confirm("Xóa ý kiến này?") && run(() => deleteEntry(e.id))}>Xóa</button>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {canOpinion && (
            <div className="mt-3">
              {recorder && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  Người phát biểu:
                  <select className="input !w-auto !py-1 text-sm" value={oSpeaker} onChange={(e) => setOSpeaker(e.target.value)}>
                    <option value="">Không ghi tên</option>
                    {activeMembers.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                  </select>
                </div>
              )}
              <textarea className="input" rows={3} maxLength={8000} value={otext}
                placeholder={recorder && oSpeaker && oSpeaker !== myMember?.id ? `Ghi lại ý kiến của ${memberName(memberById(oSpeaker))}…` : "Nêu ý kiến của bạn ở mục này…"}
                onChange={(e) => { setOtext(e.target.value); if (!e.target.value.trim()) setOAi(false); }} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary btn-sm" disabled={pending || !otext.trim()}
                  onClick={() => run(() => addOpinion(section.id, otext, oAi ? "ai_assisted" : "manual", recorder ? oSpeaker || null : myMember?.id ?? null, recorder), () => { setOtext(""); setOAi(false); })}>
                  {recorder ? "Ghi vào biên bản" : "Gửi ý kiến"}
                </button>
                <button className="btn btn-sm" disabled={!otext.trim() || !!aiBusy} onClick={() => aiPolish("opinion")}>
                  {aiBusy === "opinion" ? "AI đang soạn…" : "AI hỗ trợ ý kiến hoàn chỉnh"}
                </button>
                {!recorder && <span className="text-xs text-gray-400">Ý kiến gửi lên sẽ chờ tổ trưởng xem và quyết định.</span>}
              </div>
            </div>
          )}
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

function Proposal({ entry, speaker, locked, pending, run }: {
  entry: EntryX; speaker: Member | null; locked: boolean; pending: boolean; run: Run;
}) {
  const [body, setBody] = useState(entry.body);
  const label =
    entry.source === "nhap_file" ? "Nhập từ tệp" : entry.source === "ke_hoach" ? "Từ kế hoạch năm" : entry.source === "van_ban_moi" ? "Từ văn bản mới" : "Đề xuất của AI";
  return (
    <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50 p-3 text-sm">
      <p className="mb-1 text-xs font-medium text-violet-800">
        {label}{speaker ? ` · ${memberName(speaker)}` : ""} — chỉ tổ trưởng thấy, chưa vào biên bản
      </p>
      <textarea className="input" rows={Math.min(12, Math.max(3, body.split("\n").length + 1))} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} />
      {!locked && (
        <div className="mt-2 flex gap-2">
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => acceptProposal(entry.id, body))}>Nhận vào biên bản</button>
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => deleteEntry(entry.id))}>Bỏ</button>
        </div>
      )}
    </div>
  );
}
