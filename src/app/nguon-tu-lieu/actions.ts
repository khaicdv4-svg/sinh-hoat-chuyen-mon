"use server";
import { revalidatePath } from "next/cache";
import { requireLeader } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";
import { BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

type R = { ok: true } | { ok: false; error: string };

export async function addTextSource(kind: string, title: string, url: string, note: string): Promise<R> {
  const me = await requireLeader();
  if (!title.trim()) return { ok: false, error: "Chưa đặt tên cho nguồn." };
  if (url.trim() && !/^https?:\/\//i.test(url.trim())) return { ok: false, error: "Đường dẫn phải bắt đầu bằng https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_sources").insert({
    kind, title: title.trim().slice(0, 200), url: url.trim() || null, note: note.trim() || null,
    text_content: null, created_by: me.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/nguon-tu-lieu");
  revalidatePath("/mau-bieu");
  return { ok: true };
}

export async function setSourceEnabled(id: string, enabled: boolean): Promise<R> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_sources").update({ enabled }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/nguon-tu-lieu");
  revalidatePath("/mau-bieu");
  return { ok: true };
}

export async function deleteSource(id: string): Promise<R> {
  await requireLeader();
  const supabase = await createClient();
  const { data: src } = await supabase.from("shcm_sources").select("storage_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("shcm_sources").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (src?.storage_path) await supabase.storage.from(BUCKET).remove([src.storage_path]);
  revalidatePath("/nguon-tu-lieu");
  revalidatePath("/mau-bieu");
  return { ok: true };
}

export async function saveSkill(text: string): Promise<R> {
  await requireLeader();
  const db = adminDb();
  if (!db) return { ok: false, error: "Máy chủ chưa có SUPABASE_SERVICE_ROLE_KEY." };
  const { error } = await db.from("shcm_settings").upsert({ key: "ai_skill", value: text.slice(0, 30000) }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/nguon-tu-lieu");
  revalidatePath("/mau-bieu");
  return { ok: true };
}
