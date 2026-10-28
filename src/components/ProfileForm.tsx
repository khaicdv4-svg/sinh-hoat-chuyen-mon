"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMyProfile } from "@/app/actions";
import type { Member } from "@/lib/types";

export default function ProfileForm({ email, member, first, next }: { email: string; member: Member | null; first: boolean; next: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hon, setHon] = useState<string>(member?.honorific ?? "Cô");
  const [name, setName] = useState(member?.full_name ?? "");
  const [title, setTitle] = useState(member?.title ?? "");
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);

  function submit() {
    setMsg(""); setSaved(false);
    start(async () => {
      const r = await saveMyProfile(hon, name, title);
      if (!r.ok) { setMsg(r.error); return; }
      setSaved(true);
      router.push(next);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <label className="text-sm font-medium">Tài khoản Gmail
        <input className="input mt-1 opacity-70" value={email} readOnly />
      </label>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="text-sm font-medium">Danh xưng
          <select className="input mt-1" value={hon} onChange={(e) => setHon(e.target.value)}>
            <option>Thầy</option>
            <option>Cô</option>
          </select>
        </label>
        <label className="text-sm font-medium">Họ và tên
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nguyễn Văn A" maxLength={120} />
        </label>
      </div>
      <label className="text-sm font-medium">Nhiệm vụ
        <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Giáo viên chủ nhiệm lớp 4/2" maxLength={160} />
      </label>
      <p className="text-xs text-gray-500">Họ tên này tự hiện bên cạnh mọi ý kiến thầy cô gửi lên và trong biên bản. Tổ trưởng hoặc quản trị có thể sửa lại khi cần.</p>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending || name.trim().length < 2} onClick={submit}>
          {pending ? "Đang lưu…" : first ? "Lưu và vào ứng dụng" : "Lưu hồ sơ"}
        </button>
        {saved && <span className="text-sm text-green-800">Đã lưu.</span>}
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </div>
  );
}
