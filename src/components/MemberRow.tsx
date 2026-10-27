"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMember } from "@/app/actions";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export default function MemberRow({ p }: { p: Profile }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState(p.role);
  const [admin, setAdmin] = useState(p.is_admin);
  const [msg, setMsg] = useState("");
  const save = (status: string) =>
    start(async () => {
      const r = await setMember(p.id, role, status, admin);
      if (!r.ok) setMsg(r.error); else { setMsg(""); router.refresh(); }
    });
  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{p.full_name || "(chưa có tên)"}</div>
        <div className="text-sm text-gray-500">{p.email} · {STATUS_LABELS[p.status]}</div>
        {msg && <div className="text-sm text-red-700">{msg}</div>}
      </div>
      <select className="input !w-auto !py-1 text-sm" value={role} onChange={(e) => setRole(e.target.value as Profile["role"])}>
        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Quản trị</label>
      {p.status !== "approved" && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => save("approved")}>Duyệt</button>}
      {p.status === "approved" && <button className="btn btn-sm" disabled={pending} onClick={() => save("approved")}>Lưu</button>}
      {p.status !== "rejected" && <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => confirm("Từ chối tài khoản này?") && save("rejected")}>Từ chối</button>}
    </div>
  );
}
