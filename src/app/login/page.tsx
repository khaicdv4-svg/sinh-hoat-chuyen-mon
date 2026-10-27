"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function signIn() {
    setBusy(true);
    setErr("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setErr("Không đăng nhập được: " + error.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm card p-6 text-center">
      <h1 className="text-xl font-semibold text-[var(--brand)]">Sinh hoạt chuyên môn</h1>
      <p className="mt-2 text-sm text-gray-600">
        Đăng nhập bằng Gmail. Tài khoản mới sẽ chờ tổ trưởng duyệt trước khi dùng được.
      </p>
      <button onClick={signIn} disabled={busy} className="btn btn-primary mt-5 w-full justify-center">
        {busy ? "Đang chuyển sang Google…" : "Đăng nhập với Google"}
      </button>
      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
    </div>
  );
}
