"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeSwitcher from "./ThemeSwitcher";
import Logo from "./Logo";

export type NavUser = {
  approved: boolean; leader: boolean; admin: boolean; name: string; roleLabel: string; team: string; unread: number;
};

const TU_LIEU = [
  { href: "/ke-hoach", label: "Kế hoạch năm", icon: "🗓️" },
  { href: "/van-ban-moi", label: "Văn bản", icon: "📄" },
  { href: "/nguon-tu-lieu", label: "Nguồn tư liệu", icon: "📚" },
  { href: "/mau-bieu", label: "Mẫu biểu", icon: "📝" },
];

export default function NavMenu({ user }: { user: NavUser }) {
  const path = usePathname();
  const inTuLieu = TU_LIEU.some((t) => path.startsWith(t.href));
  const [tuLieu, setTuLieu] = useState(inTuLieu);
  const [sheet, setSheet] = useState(false); // ngăn Tư liệu trên điện thoại
  const [acct, setAcct] = useState(false); // thẻ tài khoản trên điện thoại

  useEffect(() => { setSheet(false); setAcct(false); if (inTuLieu) setTuLieu(true); }, [path, inTuLieu]);

  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const item = (href: string, label: string, icon: string, sub = false, badge = 0) => (
    <Link key={href} href={href} className={`navitem ${sub ? "navitem-sub" : ""} ${on(href) ? "navitem-on" : ""}`}>
      <span aria-hidden className="navicon">{icon}</span>{label}
      {badge > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#e5484d] px-1 text-[11px] font-bold text-white">{badge}</span>}
    </Link>
  );

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
          <Logo size={42} />
          <span>Sinh hoạt<br />chuyên môn</span>
        </Link>
        {user.approved && (
          <nav className="mt-5 grid gap-1.5">
            {item("/", "Danh sách biên bản", "📋")}
            {item("/lich-sinh-hoat", "Lịch sinh hoạt", "📅")}
            {item("/thong-ke", "Thống kê – Báo cáo", "📊")}
            {item("/thong-bao", "Thông báo", "🔔", false, user.unread)}
            {user.leader && item("/bien-ban/moi", "Tạo biên bản mới", "➕")}
            {user.leader && (
              <div className={tuLieu ? "navgroup" : ""}>
                <button type="button" className={`navitem w-full ${inTuLieu ? "navitem-on" : ""}`} aria-expanded={tuLieu} onClick={() => setTuLieu(!tuLieu)}>
                  <span aria-hidden className="navicon">📁</span>Tư liệu
                  <span aria-hidden className="ml-auto text-xs">{tuLieu ? "▲" : "▼"}</span>
                </button>
                {tuLieu && <div className="mt-1 grid gap-0.5">{TU_LIEU.map((t) => item(t.href, t.label, t.icon, true))}</div>}
              </div>
            )}
            {user.admin && item("/thanh-vien", "Thành viên", "👥")}
            {item("/ho-so", "Hồ sơ", "🙍")}
            {user.leader && item("/cai-dat-ai", "Cài đặt AI", "🤖")}
          </nav>
        )}
        <div className="mt-auto grid gap-3 pt-4">
          <ThemeSwitcher placement="up" />
          {account}
        </div>
      </aside>

      {/* Điện thoại, máy tính bảng: thanh trên gọn + thanh chọn nhanh phía dưới */}
      <header className="mobilebar print:hidden lg:hidden">
        <div className="flex items-center gap-2">
          <Link href="/" className="mobilebar-title"><Logo size={30} /><span>Sinh hoạt chuyên môn</span></Link>
          <ThemeSwitcher />
          {user.approved && (
            <Link href="/thong-bao" className="btn btn-sm relative" aria-label="Thông báo">
              🔔{user.unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#e5484d] px-1 text-[10px] font-bold text-white">{user.unread}</span>}
            </Link>
          )}
          <button type="button" className="btn btn-sm" aria-expanded={acct} aria-label="Tài khoản" onClick={() => setAcct(!acct)}>👤</button>
        </div>
        {acct && (
          <div className="mobilemenu grid gap-3">
            {user.admin && item("/thanh-vien", "Thành viên", "👥")}
            {account}
          </div>
        )}
      </header>

      {user.approved && (
        <>
          {sheet && user.leader && (
            <div className="bottomsheet lg:hidden print:hidden">
              {TU_LIEU.map((t) => item(t.href, t.label, t.icon, true))}
              {item("/cai-dat-ai", "Cài đặt AI", "🤖", true)}
            </div>
          )}
          <nav className="bottombar print:hidden lg:hidden" aria-label="Menu chính">
            <Link href="/" className={on("/") ? "on" : ""}><span className="ico" aria-hidden>📋</span>Biên bản</Link>
            <Link href="/lich-sinh-hoat" className={on("/lich-sinh-hoat") ? "on" : ""}><span className="ico" aria-hidden>📅</span>Lịch</Link>
            {user.leader && <Link href="/bien-ban/moi" className={on("/bien-ban/moi") ? "on" : ""}><span className="ico" aria-hidden>➕</span>Tạo mới</Link>}
            {user.leader && (
              <button type="button" className={inTuLieu || sheet ? "on" : ""} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
                <span className="ico" aria-hidden>📁</span>Tư liệu
              </button>
            )}
            <Link href="/ho-so" className={on("/ho-so") ? "on" : ""}><span className="ico" aria-hidden>🙍</span>Hồ sơ</Link>
          </nav>
        </>
      )}
    </>
  );
}
