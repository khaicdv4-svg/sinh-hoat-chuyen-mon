import Link from "next/link";
import type { Profile } from "@/lib/types";
import { ROLE_LABELS, TEAM_NAME } from "@/lib/constants";
import ThemeSwitcher from "./ThemeSwitcher";

export default function Nav({ profile }: { profile: Profile | null }) {
  const approved = profile?.status === "approved";
  const leader = approved && profile?.role === "to_truong";
  return (
    <header className="topbar print:hidden">
      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 pb-4 pt-3">
        <div className="flex w-full flex-wrap items-center justify-end gap-3 text-sm lg:absolute lg:right-4 lg:top-3 lg:w-auto">
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

        <Link href="/" className="topbar-title text-center">
          Sinh hoạt chuyên môn
          <span className="topbar-sub">{TEAM_NAME}</span>
        </Link>

        {approved && (
          <nav className="navblocks">
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
      </div>
    </header>
  );
}
