"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/lich-sinh-hoat/actions";

export default function MarkRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}>
      Đánh dấu tất cả đã đọc
    </button>
  );
}
