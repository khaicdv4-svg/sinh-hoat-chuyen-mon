import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member, Profile } from "@/lib/types";

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) return null;
  const { data, error } = await supabase.rpc("shcm_ensure_profile");
  if (error || !data) return null;
  return data as Profile;
});

/** Dòng thành viên (họ tên, nhiệm vụ) gắn với tài khoản; null nếu chưa khai hồ sơ. */
export const getMyMember = cache(async (userId: string): Promise<Member | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("shcm_members").select("*").eq("user_id", userId).maybeSingle();
  return (data as Member) ?? null;
});

/** Thành viên đã được duyệt. Chưa đăng nhập thì về /login, chưa được duyệt thì về /cho-duyet. */
export async function requireMember(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "approved") redirect("/cho-duyet");
  if (!(await getMyMember(profile.id))) redirect("/ho-so");
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
