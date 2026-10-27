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

export async function addEntry(
  sectionId: string, body: string, source: "manual" | "ai_assisted" = "manual", speakerId: string | null = null,
): Promise<Result> {
  const me = await requireMember();
  const text = body.trim();
  if (!text) return fail("Chưa có nội dung.");
  if (text.length > 8000) return fail("Nội dung dài quá 8000 ký tự.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("shcm_entries")
    .insert({ section_id: sectionId, author_id: me.id, body: text, source, status: "accepted", speaker_id: speakerId || null });
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function updateEntry(id: string, body: string, speakerId?: string | null): Promise<Result> {
  await requireMember();
  const text = body.trim();
  if (!text) return fail("Chưa có nội dung.");
  const supabase = await createClient();
  const patch: Record<string, unknown> = { body: text };
  if (speakerId !== undefined) patch.speaker_id = speakerId || null;
  const { error } = await supabase.from("shcm_entries").update(patch).eq("id", id);
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
  const patch: Record<string, unknown> = { status: "accepted" };
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
  patch: {
    meeting_date?: string | null; meeting_time?: string | null; place?: string | null; attendance_note?: string | null;
    subject?: string | null; topic?: string | null; title?: string; chair_member_id?: string | null;
    secretary_member_id?: string | null; ncbh_stage?: string | null;
  },
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
      part: s.part ?? null,
      layout: s.layout ?? "block",
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

/** Tổ trưởng nhận tất cả đề xuất đang chờ của một biên bản. */
export async function acceptAllProposals(meetingId: string): Promise<Result> {
  const me = await requireLeader();
  const supabase = await createClient();
  const { data: secs } = await supabase.from("shcm_sections").select("id").eq("meeting_id", meetingId);
  const ids = (secs ?? []).map((s) => s.id);
  if (!ids.length) return { ok: true };
  const { error } = await supabase.from("shcm_entries").update({ status: "accepted" }).in("section_id", ids).eq("status", "proposed");
  if (error) return fail(friendly(error.message));
  await audit(meetingId, me.id, "accept_all");
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function renameSection(id: string, title: string, hint: string | null): Promise<Result> {
  await requireLeader();
  const t = title.trim();
  if (!t) return fail("Tên mục không được trống.");
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_sections").update({ title: t, hint: hint?.trim() || null }).eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

/** Điểm danh: tổ trưởng hoặc thư ký buổi họp. rows: thành viên vắng kèm lí do; ai không có trong rows là có mặt. */
export async function saveAttendance(meetingId: string, rows: { member_id: string; present: boolean; reason: string | null }[]): Promise<Result> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shcm_attendance")
    .upsert(rows.map((r) => ({ meeting_id: meetingId, member_id: r.member_id, present: r.present, reason: r.present ? null : r.reason?.trim() || null })));
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function saveMinutes(meetingId: string, m: { end_time: string | null; vote_agree: number | null; vote_total: number | null; vote_other: string | null }): Promise<Result> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("shcm_set_minutes", {
    p_meeting: meetingId, p_end_time: m.end_time || null, p_vote_agree: m.vote_agree, p_vote_total: m.vote_total, p_vote_other: m.vote_other ?? "",
  });
  if (error) return fail(friendly(error.message));
  revalidatePath("/bien-ban/[id]", "page");
  return { ok: true };
}

export async function saveMember(m: {
  id?: string; honorific: string; full_name: string; title: string | null; email: string | null; sort_order: number; active: boolean; is_chair: boolean;
}): Promise<Result> {
  await requireLeader();
  const name = m.full_name.trim();
  if (name.length < 2) return fail("Chưa có họ tên.");
  const supabase = await createClient();
  const row = {
    honorific: m.honorific === "Thầy" ? "Thầy" : "Cô", full_name: name, title: m.title?.trim() || null,
    email: m.email?.trim().toLowerCase() || null, sort_order: m.sort_order, active: m.active, is_chair: m.is_chair,
  };
  const { error } = m.id
    ? await supabase.from("shcm_members").update(row).eq("id", m.id)
    : await supabase.from("shcm_members").insert(row);
  if (error) return fail(/duplicate|unique/i.test(error.message) ? "Email này đã gắn với thành viên khác." : friendly(error.message));
  revalidatePath("/thanh-vien");
  return { ok: true };
}

export async function deleteMember(id: string): Promise<Result> {
  await requireLeader();
  const supabase = await createClient();
  const { error } = await supabase.from("shcm_members").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  revalidatePath("/thanh-vien");
  return { ok: true };
}
