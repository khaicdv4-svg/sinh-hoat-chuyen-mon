"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeSwitcher from "./ThemeSwitcher";

export type NavUser = {
  approved: boolean; leader: boolean; admin: boolean; name: string; roleLabel: string; team: string;
};

const TU_LIEU = [
  { href: "/ke-hoach", label: "Kế hoạch năm" },
  { href: "/van-ban-moi", label: "Văn bản" },
  { href: "/nguon-tu-lieu", label: "Nguồn tư liệu" },
];

export default function NavMenu({ user }: { user: NavUser }) {
  const path = usePathname();
  const inTuLieu = TU_LIEU.some((t) => path.startsWith(t.href));
  const [tuLieu, setTuLieu] = useState(inTuLieu);
  const [open, setOpen] = useState(false); // menu điện thoại

  useEffect(() => { setOpen(false); if (inTuLieu) setTuLieu(true); }, [path, inTuLieu]);

  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const item = (href: string, label: string, icon: string, sub = false) => (
    <Link key={href} href={href} className={`navitem ${sub ? "navitem-sub" : ""} ${on(href) ? "navitem-on" : ""}`}>
      <span aria-hidden className="navicon">{icon}</span>{label}
    </Link>
  );

  const links = user.approved ? (
    <>
      {item("/", "Danh sách biên bản", "📋")}
      {user.leader && item("/bien-ban/moi", "Tạo biên bản mới", "➕")}
      {user.leader && (
        <div>
          <button type="button" className={`navitem w-full ${inTuLieu ? "navitem-on" : ""}`} aria-expanded={tuLieu} onClick={() => setTuLieu(!tuLieu)}>
            <span aria-hidden className="navicon">📚</span>Tư liệu
            <span aria-hidden className="ml-auto text-xs">{tuLieu ? "▲" : "▼"}</span>
          </button>
          {tuLieu && <div className="mt-1 grid gap-1 pl-4">{TU_LIEU.map((t) => item(t.href, t.label, "•", true))}</div>}
        </div>
      )}
      {user.leader && item("/cai-dat-ai", "Cài đặt AI", "🤖")}
      {user.admin && item("/thanh-vien", "Thành viên", "👥")}
      {item("/ho-so", "Hồ sơ", "🙍")}
    </>
  ) : null;

  const account = (
    <div className="grid gap-2 text-sm">
      <div className="text-gray-600">{user.name}<span className="ml-1 text-xs text-gray-400">({user.roleLabel})</span></div>
      <form action="/auth/signout" method="post"><button className="btn btn-sm w-full">Đăng xuất</button></form>
    </div>
  );

  return (
    <>
      {/* Máy tính: thanh menu bên trái */}
      <aside className="sidebar hidden print:hidden lg:flex">
        <Link href="/" className="sidebar-brand">
          Sinh hoạt<br />chuyên môn
          <span className="topbar-sub">{user.team}</span>
        </Link>
        <nav className="mt-4 grid gap-1.5">{links}</nav>
        <div className="mt-auto grid gap-3 pt-4">
          <ThemeSwitcher placement="up" />
          {account}
        </div>
      </aside>

      {/* Điện thoại, máy tính bảng: thanh trên cùng gọn */}
      <header className="mobilebar print:hidden lg:hidden">
        <div className="flex items-center gap-2">
          <Link href="/" className="mobilebar-title">Sinh hoạt chuyên môn</Link>
          <ThemeSwitcher />
          <button type="button" className="btn btn-sm" aria-expanded={open} aria-label="Mở menu" onClick={() => setOpen(!open)}>
            {open ? "✕" : "☰ Menu"}
          </button>
        </div>
        {open && (
          <div className="mobilemenu">
            <nav className="grid gap-1.5">{links}</nav>
            <div className="mt-3 border-t border-[var(--line)] pt-3">{account}</div>
          </div>
        )}
      </header>
    </>
  );
}
