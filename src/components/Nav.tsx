import Link from "next/link";
import type { Profile } from "@/lib/types";
import { ROLE_LABELS, TEAM_NAME } from "@/lib/constants";
import ThemeSwitcher from "./ThemeSwitcher";

export default function Nav({ profile }: { profile: Profile | null }) {
  const approved = profile?.status === "approved";
  const leader = approved && profile?.role === "to_truong";
  return (
    <header className="topbar print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-[var(--brand)]">
          Sinh hoạt chuyên môn
          <span className="ml-2 hidden text-xs font-normal text-gray-500 sm:inline">{TEAM_NAME}</span>
        </Link>
        {approved && (
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/">Biên bản</Link>
            {leader && <Link href="/ke-hoach">Kế hoạch năm</Link>}
            {leader && <Link href="/van-ban-moi">Văn bản mới</Link>}
            {leader && <Link href="/nguon-tu-lieu">Nguồn tư liệu</Link>}
            {leader && <Link href="/cai-dat-ai">Cài đặt AI</Link>}
            {leader && <Link href="/bien-ban/moi">Thêm biên bản</Link>}
            {profile?.is_admin && <Link href="/thanh-vien">Thành viên</Link>}
            <Link href="/ho-so">Hồ sơ</Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <ThemeSwitcher />
          {profile ? (
            <>
              <span className="text-gray-600">
                {profile.full_name || profile.email}
                <span className="ml-1 text-xs text-gray-400">({ROLE_LABELS[profile.role]})</span>
              </span>
              <form action="/auth/signout" method="post">
                <button className="btn btn-sm">Đăng xuất</button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
