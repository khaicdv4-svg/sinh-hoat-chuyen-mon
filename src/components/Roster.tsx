"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMember, saveMember } from "@/app/actions";
import type { Member } from "@/lib/types";

type Row = { id?: string; honorific: string; full_name: string; title: string; email: string; sort_order: number; active: boolean; is_chair: boolean; linked: boolean };

const toRow = (m: Member): Row => ({
  id: m.id, honorific: m.honorific, full_name: m.full_name, title: m.title ?? "", email: m.email ?? "",
  sort_order: m.sort_order, active: m.active, is_chair: m.is_chair, linked: !!m.user_id,
});

export default function Roster({ members }: { members: Member[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(members.map(toRow));
  const [msg, setMsg] = useState("");

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = (r: Row) =>
    start(async () => {
      const res = await saveMember({ ...r, title: r.title || null, email: r.email || null });
      if (!res.ok) setMsg(res.error); else { setMsg(""); router.refresh(); }
    });

  return (
    <div className="card overflow-x-auto p-3">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr><th className="p-1">TT</th><th className="p-1">Danh xưng</th><th className="p-1">Họ tên</th><th className="p-1">Chức vụ, lớp</th><th className="p-1">Gmail</th><th className="p-1">Chủ trì</th><th className="p-1">Còn trong tổ</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `new${i}`} className="border-t border-[var(--line)]">
              <td className="p-1"><input type="number" className="input !w-14 !py-1" value={r.sort_order} onChange={(e) => patch(i, { sort_order: Number(e.target.value) })} /></td>
              <td className="p-1">
                <select className="input !w-20 !py-1" value={r.honorific} onChange={(e) => patch(i, { honorific: e.target.value })}><option>Thầy</option><option>Cô</option></select>
              </td>
              <td className="p-1"><input className="input !py-1" value={r.full_name} onChange={(e) => patch(i, { full_name: e.target.value })} /></td>
              <td className="p-1"><input className="input !py-1" value={r.title} placeholder="GVCN lớp 4/…" onChange={(e) => patch(i, { title: e.target.value })} /></td>
              <td className="p-1">
                <input className="input !py-1" value={r.email} placeholder="để nối tài khoản" onChange={(e) => patch(i, { email: e.target.value })} />
                {r.id && <span className={`text-xs ${r.linked ? "text-green-700" : "text-gray-400"}`}>{r.linked ? "đã có tài khoản" : "chưa đăng nhập"}</span>}
              </td>
              <td className="p-1 text-center"><input type="checkbox" checked={r.is_chair} onChange={(e) => patch(i, { is_chair: e.target.checked })} /></td>
              <td className="p-1 text-center"><input type="checkbox" checked={r.active} onChange={(e) => patch(i, { active: e.target.checked })} /></td>
              <td className="whitespace-nowrap p-1">
                <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => save(r)}>Lưu</button>
                {r.id ? (
                  <button className="btn btn-sm btn-danger ml-1" disabled={pending}
                    onClick={() => confirm(`Xóa ${r.full_name} khỏi danh sách? Nếu thầy cô chỉ chuyển công tác, nên bỏ dấu "Còn trong tổ" để giữ tên trong các biên bản cũ.`) &&
                      start(async () => { const res = await deleteMember(r.id!); if (!res.ok) setMsg(res.error); else router.refresh(); })}>Xóa</button>
                ) : (
                  <button className="btn btn-sm ml-1" onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>Bỏ</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm mt-2"
        onClick={() => setRows((r) => [...r, { honorific: "Cô", full_name: "", title: "", email: "", sort_order: r.length + 1, active: true, is_chair: false, linked: false }])}>
        + Thêm thành viên
      </button>
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
