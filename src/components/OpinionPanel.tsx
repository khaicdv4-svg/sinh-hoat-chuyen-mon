"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Entry, Member, Profile } from "@/lib/types";
import { addOpinion, decideOpinion, deleteEntry, updateEntry } from "@/app/actions";
import { fmtDateTime, memberName } from "@/lib/format";

type EntryX = Entry & { author?: { full_name: string | null; email?: string } | null };

function who(p?: { full_name: string | null; email?: string } | null) {
  return p?.full_name || p?.email || "Thành viên đã rời tổ";
}

/**
 * Khung ý kiến của các thành viên. Dùng ở cuối mỗi mục lớn I–IV (gom ý kiến của mọi mục nhỏ bên trong)
 * hoặc trong một mục lẻ không thuộc phần nào.
 * Ý kiến mới được lưu vào mục đích (targetSectionId).
 */
/** Thông tin để tổ trưởng nhờ AI viết ý kiến thay thành viên chưa gửi (cuối mục lớn I–IV). */
export type FillInfo = { meetingId: string; part: string; modelId: string; missing: Member[]; skip: string[] };

export default function OpinionPanel({
  title, targetSectionId, canTarget, entries, members, myMember, me, secretary, locked, boxed = false, emptyNote, fill,
}: {
  title: string; targetSectionId: string | null; canTarget: boolean; entries: EntryX[]; members: Member[]; myMember: Member | null;
  me: Profile; secretary: boolean; locked: boolean; boxed?: boolean; emptyNote?: string; fill?: FillInfo | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [otext, setOtext] = useState("");
  const [oSpeaker, setOSpeaker] = useState(myMember?.id ?? "");
  const [oAi, setOAi] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [fillNote, setFillNote] = useState("");
  const [fillBusy, setFillBusy] = useState(false);
  const [fillMsg, setFillMsg] = useState("");

  const leader = me.role === "to_truong";
  const recorder = leader || secretary;
  const writer = me.role === "giao_vien" || me.role === "to_truong";
  // Giáo viên chỉ gửi được vào mục cho phép ý kiến; tổ trưởng, thư ký ghi được ở mọi mục
  const canOpinion = !locked && writer && !!targetSectionId && (canTarget || leader);
  const opAccepted = entries.filter((e) => e.kind === "y_kien" && e.status === "accepted");
  const opPending = entries.filter((e) => e.kind === "y_kien" && e.status === "pending");
  const opDismissed = entries.filter((e) => e.kind === "y_kien" && e.status === "dismissed");
  const memberById = (id: string | null) => members.find((m) => m.id === id) ?? null;
  const activeMembers = members.filter((m) => m.active);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Có lỗi.");
      else { setMsg(""); after?.(); router.refresh(); }
    });

  async function aiPolish() {
    if (!otext.trim()) return;
    setAiBusy(true); setMsg("");
    try {
      const sp = recorder ? oSpeaker || null : myMember?.id ?? null;
      const res = await fetch("/api/ai/opinion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: targetSectionId, text: otext, speakerId: sp }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa trả lời được.");
      setOtext(j.text); setOAi(true);
    } catch (e) { setMsg((e as Error).message); }
    setAiBusy(false);
  }

  const aiPending = opPending.filter((e) => e.source === "ai_summary");

  function openFill() {
    if (!fill) return;
    setPicked(fill.missing.filter((m) => !fill.skip.includes(m.id)).map((m) => m.id));
    setFillMsg(""); setFillOpen(!fillOpen);
  }

  async function runFill() {
    if (!fill || !picked.length) return;
    setFillBusy(true); setFillMsg(""); setMsg("");
    try {
      const res = await fetch("/api/ai/opinions-fill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: fill.meetingId, part: fill.part, memberIds: picked, modelId: fill.modelId, note: fillNote }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI chưa viết được.");
      setFillOpen(false); setFillNote("");
      setFillMsg(`AI đã viết ${j.added} ý kiến (khung vàng). Thầy đọc, sửa nếu cần rồi bấm “Ghi nhận ý kiến”.`);
      router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setFillBusy(false);
  }

  const showFill = !!fill && leader && !locked;
  if (!(opAccepted.length || opPending.length || opDismissed.length || canOpinion || showFill)) return null;

  return (
    <div className={boxed ? "card border-l-4 !border-l-amber-400 p-4" : "mt-4 border-t border-dashed border-[var(--line)] pt-3"}>
      <p className={boxed ? "font-semibold" : "text-sm font-semibold text-gray-700"}>{title}</p>
      {boxed && !opAccepted.length && !opPending.length && emptyNote && <p className="mt-1 text-sm text-red-600">{emptyNote}</p>}
      {showFill && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" disabled={fillBusy} onClick={openFill}>
              🤖 AI viết ý kiến thay thành viên chưa gửi{fill!.missing.length ? ` (${fill!.missing.length})` : ""}
            </button>
            {aiPending.length > 1 && (
              <button type="button" className="btn btn-sm" disabled={pending}
                onClick={() => run(async () => {
                  for (const e of aiPending) { const r = await decideOpinion(e.id, "accepted"); if (!r.ok) return r; }
                  return { ok: true };
                })}>
                Ghi nhận cả {aiPending.length} ý kiến AI viết
              </button>
            )}
          </div>
          {fillOpen && (
            <div className="well mt-2 grid gap-2 p-3 text-sm">
              {fill!.missing.length === 0 ? (
                <p className="text-gray-600">Mọi thành viên có mặt đều đã có ý kiến ở mục này.</p>
              ) : (
                <>
                  <p className="text-gray-600">Chọn người cần viết thay (người vắng họp không có trong danh sách). AI viết theo đúng bước nghiên cứu bài học, kế hoạch bài dạy và kỹ năng viết biên bản đã lưu ở Cài đặt AI.</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {fill!.missing.map((m) => (
                      <label key={m.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={picked.includes(m.id)}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />
                        {memberName(m)}{m.title ? <span className="text-xs text-gray-500"> · {m.title}</span> : null}
                      </label>
                    ))}
                  </div>
                  <textarea className="input" rows={2} value={fillNote} onChange={(e) => setFillNote(e.target.value)}
                    placeholder="Dặn thêm AI (không bắt buộc). Ví dụ: Cô Thu nêu học sinh lớp 4/5 còn lúng túng khi làm thí nghiệm." />
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-primary btn-sm" disabled={fillBusy || !picked.length} onClick={runFill}>
                      {fillBusy ? "AI đang viết…" : `Viết ${picked.length} ý kiến`}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setFillOpen(false)}>Hủy</button>
                  </div>
                </>
              )}
            </div>
          )}
          {fillMsg && <p className="mt-1 text-sm text-green-700">{fillMsg}</p>}
        </div>
      )}
      <div className="mt-2 grid gap-2">
        {opAccepted.map((e) => {
          const sp = memberById(e.speaker_id);
          return (
            <div key={e.id} className="well p-3 text-sm">
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
                    {!locked && recorder && (
                      <>
                        <button className="ml-3 underline" onClick={() => { setEditing(e.id); setEditText(e.body); }}>Sửa</button>
                        <button className="ml-2 underline" disabled={pending} onClick={() => confirm("Xóa ý kiến này?") && run(() => deleteEntry(e.id))}>Xóa</button>
                      </>
                    )}
                    {leader && !locked && (
                      <button className="ml-2 underline" disabled={pending} onClick={() => run(() => decideOpinion(e.id, "pending"))}>Trả về chờ xử lý</button>
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
                      {e.source === "ai_summary" ? <span className="badge badge-ai mr-2">AI viết thay, tổ trưởng đọc lại</span> : null}
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
                  <button className="btn btn-primary btn-sm" disabled={pending} title="Đưa vào biên bản, ở phần ý kiến cuối mục" onClick={() => run(() => decideOpinion(e.id, "accepted"))}>Ghi nhận ý kiến</button>
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
              <select className="input !w-auto max-w-full !py-1 text-sm" value={oSpeaker} onChange={(e) => setOSpeaker(e.target.value)}>
                <option value="">Không ghi tên</option>
                {activeMembers.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
              </select>
            </div>
          )}
          <textarea className="input" rows={3} maxLength={8000} value={otext}
            placeholder={recorder && oSpeaker && oSpeaker !== myMember?.id ? `Ghi lại ý kiến của ${memberName(memberById(oSpeaker))}…` : "Nêu ý kiến của bạn về mục này…"}
            onChange={(e) => { setOtext(e.target.value); if (!e.target.value.trim()) setOAi(false); }} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending || !otext.trim()}
              onClick={() => run(() => addOpinion(targetSectionId!, otext, oAi ? "ai_assisted" : "manual", recorder ? oSpeaker || null : myMember?.id ?? null, recorder), () => { setOtext(""); setOAi(false); })}>
              {recorder ? "Ghi vào biên bản" : "Gửi ý kiến"}
            </button>
            <button className="btn btn-sm" disabled={!otext.trim() || aiBusy} onClick={aiPolish}>
              {aiBusy ? "AI đang soạn…" : "AI hỗ trợ ý kiến hoàn chỉnh"}
            </button>
            {!recorder && <span className="text-xs text-gray-400">Ý kiến gửi lên sẽ chờ tổ trưởng xem và quyết định.</span>}
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
