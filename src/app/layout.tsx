import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Sinh hoạt chuyên môn — Tổ 4",
  description: "Biên bản sinh hoạt chuyên môn điện tử của tổ chuyên môn khối 4",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  let unread = 0;
  if (profile?.status === "approved") {
    try {
      const supabase = await createClient();
      const { count } = await supabase.from("shcm_notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).is("read_at", null);
      unread = count ?? 0;
    } catch { /* không có thông báo thì thôi, không làm hỏng trang */ }
  }
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen lg:flex">
        <Nav profile={profile} unread={unread} />
        <main className="mx-auto w-full min-w-0 max-w-[88rem] flex-1 px-4 pb-24 pt-5 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>
      </body>
    </html>
  );
}
