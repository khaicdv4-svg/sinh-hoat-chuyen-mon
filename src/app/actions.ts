"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireLeader, requireMember } from "@/lib/auth";
import type { TemplateSection } from "@/lib/types";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (e: { message: string } | string): Result => ({ ok: false, error: typeof e === "string" ? e : e.message });

async function audit(meetingId: string | null, userId: string, action: string, detail?: object) {
  const supabase = await createClient();
  await supabase.from("shcm_audit").insert({ meeting_id: meetingId, user_id: userId, action, detail: detail ?? null });
}

export async function addEntry(sectionId: string, body: string, source: "manual" | "ai_assisted" = "manual"): Promise<Result> {
  const me = await requireMember();
  const text = body.trim();
  if (!text) return fail("Chưa có nội dung.");
  if (text.length > 8000) return fail("Nội dung dài quá 8000 ký tự.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("shcm_entries")
    .insert({ section_id: sectionId, author_id: me.id, body: text, source, status: "accepted" });
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function updateEntry(id: string, body: string): Promise<Result> {
  await requireMember();
  const text = body.trim();
  if (!text) return fail("Chưa có nội dung.");
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_entries").update({ body: text, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function deleteEntry(id: string): Promise<Result> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_entries").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

/** Tổ trưởng nhận đề xuất của AI vào biên bản (có thể sửa lại nội dung). */
export async function acceptProposal(id: string, body?: string): Promise<Result> {
  const me = await requireLeader();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: "accepted", updated_at: new Date().toISOString() };
  if (body && body.trim()) patch.body = body.trim();
  const { data, error } = await supabase.from("shcm_entries").update(patch).eq("id", id).select("section_id").single();
  if (error) return fail(friendly(error.message));
  await audit(null, me.id, "accept_proposal", { entry: id, section: data?.section_id });
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function setAssignee(sectionId: string, userId: string | null): Promise<Result> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_sections").update({ assignee_id: userId || null }).eq("id", sectionId);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function deleteFile(id: string, storagePath: string): Promise<Result> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_files").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  await supabase.storage.from("shcm-files").remove([storagePath]);
  revalidatePath("/bien-ban/[id]", "page");
  revalidatePath("/ke-hoach");
  revalidatePath("/van-ban-moi");
  return { ok: true };
}

export async function updateMeeting(
  id: string,
  patch: { meeting_date?: string | null; meeting_time?: string | null; place?: string | null; secretary_id?: string | null; attendance_note?: string | null; subject?: string | null; topic?: string | null; title?: string },
): Promise<Result> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_meetings").update(patch).eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  revalidatePath("/");
  return { ok: true };
}

// Nhật ký khóa/mở khóa do trigger trong cơ sở dữ liệu ghi.
export async function lockMeeting(id: string): Promise<Result> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shcm_meetings")
    .update({ status: "locked" })
    .eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  revalidatePath("/");
  return { ok: true };
}

export async function unlockMeeting(id: string): Promise<Result> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_meetings").update({ status: "open" }).eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteMeeting(id: string): Promise<Result> {
  const me = await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_meetings").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  await audit(null, me.id, "delete_meeting", { id });
  revalidatePath("/");
  redirect("/");
}

/** Gắn một bộ đề mục (NCBH, chuyên đề, thống nhất đề…) vào biên bản. */
export async function applyTemplate(meetingId: string, templateId: string): Promise<Result> {
  const me = await requireLeader();
  const supabase = await createClient();
  const { data: tpl, error } = await supabase.from("shcm_templates").select("name, sections").eq("id", templateId).single();
  if (error || !tpl) return fail("Không tìm thấy mẫu.");
  const r = await addSections(meetingId, tpl.sections as TemplateSection[]);
  if (!r.ok) return r;
  await audit(meetingId, me.id, "apply_template", { template: tpl.name });
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

async function addSections(meetingId: string, sections: TemplateSection[]): Promise<Result> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("shcm_sections").select("key").eq("meeting_id", meetingId);
  const have = new Set((existing ?? []).map((s) => s.key));
  const rows = sections
    .filter((s) => !have.has(s.key))
    .map((s, i) => ({
      meeting_id: meetingId,
      key: s.key,
      title: s.title,
      hint: s.hint ?? null,
      position: s.position ?? 500 + i * 10,
      entry_editors: s.entry_editors,
      file_editors: s.file_editors,
      files_mode: s.files_mode,
      file_label: s.file_label ?? null,
      ai_action: s.ai_action ?? "none",
    }));
  if (!rows.length) return fail("Biên bản này đã có đủ các đề mục của mẫu.");
  const { error } = await supabase.from("shcm_sections").insert(rows);
  if (error) return fail(friendly(error.message));
  return { ok: true };
}

export async function deleteSection(id: string): Promise<Result> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_sections").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

/** Tạo biên bản mới (kind 'khac') từ danh sách đề mục đã duyệt. */
export async function createMeeting(input: {
  title: string;
  meeting_date: string | null;
  meeting_time: string | null;
  place: string | null;
  sections: TemplateSection[];
  saveAsTemplate?: { name: string; description?: string } | null;
}): Promise<Result> {
  const me = await requireLeader();
  const title = input.title.trim();
  if (!title) return fail("Chưa đặt tên biên bản.");
  if (!input.sections.length) return fail("Biên bản cần có ít nhất một đề mục.");
  const supabase = await createClient();
  const { data: m, error } = await supabase
    .from("shcm_meetings")
    .insert({
      title,
      kind: "khac",
      meeting_date: input.meeting_date || null,
      meeting_time: input.meeting_time || null,
      place: input.place || null,
      position: 1000,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !m) return fail(friendly(error?.message ?? "Không tạo được biên bản."));
  const secs = input.sections.map((s, i) => ({ ...s, key: s.key || `muc_${i + 1}`, position: (i + 1) * 10 }));
  const r = await addSections(m.id, secs);
  if (!r.ok) return r;
  if (input.saveAsTemplate?.name.trim()) {
    await supabase.from("shcm_templates").insert({
      name: input.saveAsTemplate.name.trim(),
      description: input.saveAsTemplate.description ?? null,
      sections: secs,
      is_system: false,
      created_by: me.id,
    });
  }
  await audit(m.id, me.id, "create_meeting", { title });
  revalidatePath("/");
  return { ok: true, id: m.id };
}

export async function setMember(userId: string, role: string, status: string, isAdmin: boolean): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("shcm_set_member", { p_user: userId, p_role: role, p_status: status, p_admin: isAdmin });
  if (error) return fail(friendly(error.message));
  revalidatePath("/thanh-vien");
  return { ok: true };
}

function friendly(msg: string): string {
  if (/row-level security|violates row-level/i.test(msg)) return "Bạn không có quyền làm thao tác này, hoặc biên bản đã khóa.";
  if (/khóa|locked/i.test(msg)) return "Biên bản đã khóa, không sửa được.";
  return msg;
}
