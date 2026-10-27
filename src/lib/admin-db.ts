import { createClient } from "@supabase/supabase-js";

/** Client dùng khóa service role, chỉ chạy trên máy chủ. Không bao giờ gửi xuống trình duyệt. */
export function adminDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
