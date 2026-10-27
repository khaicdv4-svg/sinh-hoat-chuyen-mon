import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("shcm_ensure_profile");
  if (error || !data) return null;
  return data as Profile;
});

/** Thành viên đã được duyệt. Chưa đăng nhập thì về /login, chưa được duyệt thì về /cho-duyet. */
export async function requireMember(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "approved") redirect("/cho-duyet");
  return profile;
}

export async function requireLeader(): Promise<Profile> {
  const profile = await requireMember();
  if (profile.role !== "to_truong") redirect("/?error=" + encodeURIComponent("Chỉ tổ trưởng dùng được chức năng này."));
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireMember();
  if (!profile.is_admin) redirect("/?error=" + encodeURIComponent("Chỉ quản trị dùng được chức năng này."));
  return profile;
}

export const canWrite = (p: Profile) => p.role === "giao_vien" || p.role === "to_truong";
export const isLeader = (p: Profile) => p.role === "to_truong";
