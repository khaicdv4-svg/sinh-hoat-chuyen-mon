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
export default function OpinionPanel({
  title, targetSectionId, canTarget, entries, members, myMember, me, secretary, locked, boxed = false, emptyNote,
}: {
  title: string; targetSectionId: string | null; canTarget: boolean; entries: EntryX[]; members: Member[]; myMember: Member | null;
  me: Profile; secretary: boolean; locked: boolean; boxed?: boolean; emptyNote?: string;
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

  if (!(opAccepted.length || opPending.length || opDismissed.length || canOpinion)) return null;

  return (
    <div className={boxed ? "card border-l-4 !border-l-amber-400 p-4" : "mt-4 border-t border-dashed border-[var(--line)] pt-3"}>
      <p className={boxed ? "font-semibold" : "text-sm font-semibold text-gray-700"}>{title}</p>
      {boxed && !opAccepted.length && !opPending.length && emptyNote && <p className="mt-1 text-sm text-red-600">{emptyNote}</p>}
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
