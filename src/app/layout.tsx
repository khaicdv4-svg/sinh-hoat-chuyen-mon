import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { getProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sinh hoạt chuyên môn — Tổ 4",
  description: "Biên bản sinh hoạt chuyên môn điện tử của tổ chuyên môn khối 4",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <Nav profile={profile} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
