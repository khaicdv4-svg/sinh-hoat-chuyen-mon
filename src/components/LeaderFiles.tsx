"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteFile } from "@/app/actions";
import { BUCKET, MAX_FILE_BYTES } from "@/lib/constants";
import { fmtDateTime, fmtSize, safeFileName } from "@/lib/format";
import type { FileRow } from "@/lib/types";

type Meet = { id: string; title: string; date: string | null };
type Analysis = {
  ten_van_ban: string; tom_tat: string; diem_ap_dung: string[]; hieu_luc: string; goi_y: "next" | "from_now"; ly_do: string; meetings: Meet[];
};

export default function LeaderFiles({
  kind, files, me, actionLabel,
}: { kind: "ke_hoach" | "van_ban_moi"; files: FileRow[]; me: string; actionLabel: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [dlg, setDlg] = useState<{ file: FileRow; a: Analysis } | null>(null);
  const [points, setPoints] = useState("");
  const [scope, setScope] = useState<"next" | "from_now" | "meeting">("next");
  const [meetingId, setMeetingId] = useState("");

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy("upload"); setMsg(""); setOk("");
    const supabase = createClient();
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) { setMsg(`"${file.name}" lớn hơn 50 MB.`); continue; }
      const path = `leader/${kind}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) { setMsg(`Không tải được "${file.name}": ${up.error.message}`); continue; }
      const { error } = await supabase.from("shcm_files").insert({ kind, storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, uploaded_by: me });
      if (error) { await supabase.storage.from(BUCKET).remove([path]); setMsg(error.message); }
    }
    if (input.current) input.current.value = "";
    setBusy(""); router.refresh();
  }

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Có lỗi.");
    return j;
  }

  async function runPlan(f: FileRow) {
    setBusy(f.id); setMsg(""); setOk("");
    try {
      const j = await post("/api/ai/plan", { fileId: f.id });
      setOk(`AI đã chia ${j.total} việc vào ${j.meetings} biên bản. Các việc nằm ở mục "Nhiệm vụ của thời điểm", chỉ tổ trưởng thấy cho đến khi bạn nhận vào biên bản.`);
      router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }

  async function openApply(f: FileRow) {
    setBusy(f.id); setMsg(""); setOk("");
    try {
      const a = (await post("/api/ai/apply", { mode: "analyze", fileId: f.id })) as Analysis;
      setDlg({ file: f, a });
      setPoints(a.diem_ap_dung.join("\n"));
      setScope(a.goi_y);
      setMeetingId(a.meetings[0]?.id ?? "");
    } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }

  async function confirmApply() {
    if (!dlg) return;
    setBusy("apply"); setMsg("");
    try {
      const j = await post("/api/ai/apply", {
        mode: "apply", fileId: dlg.file.id, scope, meetingId: scope === "meeting" ? meetingId : undefined,
        points: points.split("\n").map((s) => s.replace(/^[-•\s]+/, "").trim()).filter(Boolean),
      });
      setOk(`Đã đưa vào mục "Việc chung" của ${j.meetings} biên bản (dạng đề xuất, bạn nhận từng biên bản).`);
      setDlg(null); router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }

  return (
    <div>
      <input ref={input} type="file" multiple className="hidden" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => upload(e.target.files)} />
      <button className="btn btn-primary" disabled={busy === "upload"} onClick={() => input.current?.click()}>
        {busy === "upload" ? "Đang tải lên…" : "+ Tải tệp lên"}
      </button>
      <span className="ml-2 text-xs text-gray-500">AI đọc được PDF, Word (.docx) và ảnh chụp</span>
      {msg && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</p>}
      {ok && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}
      <div className="mt-4 grid gap-2">
        {files.length === 0 && <p className="text-sm text-gray-500">Chưa có tệp nào.</p>}
        {files.map((f) => (
          <div key={f.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="break-words font-medium">{f.file_name}</div>
              <div className="text-xs text-gray-500">
                {fmtDateTime(f.created_at)} {fmtSize(f.size_bytes) && `· ${fmtSize(f.size_bytes)}`}
                {f.applied_at && <span className="badge badge-ai ml-2">Đã áp dụng: {f.applied_scope}</span>}
              </div>
            </div>
            <button className="btn btn-sm" disabled={!!busy || pending} onClick={() => (kind === "ke_hoach" ? runPlan(f) : openApply(f))}>
              {busy === f.id ? "AI đang đọc…" : actionLabel}
            </button>
            <button className="btn btn-sm btn-danger" disabled={!!busy || pending}
              onClick={() => confirm("Xóa tệp này? Các đề xuất AI chưa nhận từ tệp này vẫn còn trong biên bản.") && start(async () => { const r = await deleteFile(f.id, f.storage_path); if (!r.ok) setMsg(r.error); else router.refresh(); })}>Xóa</button>
          </div>
        ))}
      </div>

      {dlg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5">
            <h3 className="text-lg font-semibold">{dlg.a.ten_van_ban || dlg.file.file_name}</h3>
            <p className="mt-1 text-sm text-gray-700">{dlg.a.tom_tat}</p>
            <p className="mt-1 text-sm text-gray-500">Hiệu lực: {dlg.a.hieu_luc}</p>
            <label className="mt-4 block text-sm font-medium">Những việc tổ cần làm (mỗi dòng một việc, bạn sửa được)
              <textarea className="input mt-1" rows={7} value={points} onChange={(e) => setPoints(e.target.value)} />
            </label>
            <fieldset className="mt-4 text-sm">
              <legend className="font-medium">Áp dụng cho biên bản nào?</legend>
              <p className="text-xs text-gray-500">AI gợi ý: {dlg.a.goi_y === "next" ? "chỉ biên bản kế tiếp" : "từ biên bản kế tiếp trở đi"}. {dlg.a.ly_do}</p>
              {dlg.a.meetings.length === 0 && <p className="mt-2 text-amber-800">Không còn biên bản nào chưa họp để áp dụng.</p>}
              <label className="mt-2 flex items-center gap-2"><input type="radio" checked={scope === "next"} onChange={() => setScope("next")} /> Chỉ biên bản kế tiếp{dlg.a.meetings[0] ? ` (${dlg.a.meetings[0].title})` : ""}</label>
              <label className="mt-1 flex items-center gap-2"><input type="radio" checked={scope === "from_now"} onChange={() => setScope("from_now")} /> Từ biên bản kế tiếp đến hết năm ({dlg.a.meetings.length} biên bản)</label>
              <label className="mt-1 flex items-center gap-2"><input type="radio" checked={scope === "meeting"} onChange={() => setScope("meeting")} /> Một biên bản cụ thể
                <select className="input !w-auto !py-1" value={meetingId} onChange={(e) => { setMeetingId(e.target.value); setScope("meeting"); }}>
                  {dlg.a.meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </label>
              <p className="mt-2 text-xs text-gray-500">Biên bản đã họp hoặc đã khóa không bị thay đổi.</p>
            </fieldset>
            {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => setDlg(null)}>Hủy</button>
              <button className="btn btn-primary" disabled={busy === "apply" || !dlg.a.meetings.length} onClick={confirmApply}>{busy === "apply" ? "Đang áp dụng…" : "Áp dụng"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
