"use server";
import { revalidatePath } from "next/cache";
import { requireLeader, requireMember } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtTime, fmtWeekday } from "@/lib/format";
import { FORMAT_LABELS, TEAM_NAME } from "@/lib/constants";
import { mailEnabled, sendMail } from "@/lib/mail";

type R = { ok: true; sent: number; emailed: number; note?: string } | { ok: false; error: string };

/** Tổ trưởng chọn hình thức họp (trực tiếp hoặc trực tuyến) và, nếu muốn, báo ngay cho các thành viên. */
export async function setMeetingFormat(
  meetingId: string,
  input: { format: "truc_tiep" | "truc_tuyen"; place: string; platform: string; link: string; notify: boolean },
): Promise<R> {
  const me = await requireLeader();
  if (input.format !== "truc_tiep" && input.format !== "truc_tuyen") return { ok: false, error: "Chưa chọn hình thức họp." };
  const supabase = await createClient();
  const { data: m } = await supabase.from("shcm_meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!m) return { ok: false, error: "Không tìm thấy buổi họp." };
  if (m.status === "locked") return { ok: false, error: "Biên bản đã khóa, mở khóa rồi mới đổi được." };

  const place = input.place.trim().slice(0, 200);
  const platform = input.platform.trim().slice(0, 60);
  const link = input.link.trim().slice(0, 500);
  if (input.format === "truc_tuyen") {
    if (!platform) return { ok: false, error: "Chọn nền tảng họp trực tuyến." };
    if (!/^https?:\/\//i.test(link)) return { ok: false, error: "Dán đường dẫn phòng họp, bắt đầu bằng https://" };
  } else if (!place && !m.place) {
    return { ok: false, error: "Ghi địa điểm họp trực tiếp." };
  }

  const patch: Record<string, unknown> = { format: input.format };
  if (input.format === "truc_tuyen") {
    patch.online_platform = platform;
    patch.online_link = link;
    patch.place = `Họp trực tuyến qua ${platform}`;
  } else {
    patch.online_platform = null;
    patch.online_link = null;
    if (place) patch.place = place;
  }
  const { error } = await supabase.from("shcm_meetings").update(patch).eq("id", meetingId);
  if (error) return { ok: false, error: error.message };

  let sent = 0;
  let emailed = 0;
  let note: string | undefined;
  if (input.notify) {
    const db = adminDb();
    if (!db) {
      note = "Đã lưu hình thức họp nhưng chưa gửi được thông báo vì máy chủ thiếu SUPABASE_SERVICE_ROLE_KEY.";
    } else {
      const where = input.format === "truc_tuyen" ? `qua ${platform}` : `tại ${place || m.place}`;
      const weeks = m.week_from != null ? ` (tuần ${m.week_from}${m.week_to && m.week_to !== m.week_from ? ` + ${m.week_to}` : ""})` : "";
      const when = m.meeting_date ? `${fmtWeekday(m.meeting_date)}, ${fmtDate(m.meeting_date)}${m.meeting_time ? `, ${fmtTime(m.meeting_time)}` : ""}` : "chưa định ngày";
      const again = !!m.format_notified_at;
      const title = `${again ? "Cập nhật: " : ""}${m.title} họp ${input.format === "truc_tuyen" ? "trực tuyến" : "trực tiếp"}`;
      const lines = [
        `${TEAM_NAME}${weeks} sinh hoạt chuyên môn vào ${when}.`,
        `Hình thức: ${FORMAT_LABELS[input.format].toLowerCase()} ${where}.`,
        input.format === "truc_tuyen" ? `Đường dẫn vào họp: ${link}` : "",
      ].filter(Boolean);
      const body = lines.join("\n");

      const { data: members } = await supabase.from("shcm_members").select("user_id, email, active");
      const targets = (members ?? []).filter((x) => x.active !== false);
      const userIds = Array.from(new Set(targets.map((x) => x.user_id).filter((u): u is string => !!u && u !== me.id)));
      if (userIds.length) {
        const { error: e2 } = await db.from("shcm_notifications").insert(
          userIds.map((u) => ({ user_id: u, meeting_id: meetingId, kind: "lich_hop", title, body })),
        );
        if (e2) note = "Đã lưu hình thức họp nhưng tạo thông báo bị lỗi: " + e2.message;
        else sent = userIds.length;
      }
      if (mailEnabled()) {
        const emails = Array.from(new Set(targets.map((x) => x.email?.trim()).filter((e): e is string => !!e)));
        const results = await Promise.all(emails.map((e) => sendMail(e, title, body)));
        emailed = results.filter(Boolean).length;
      }
      if (!note) {
        const noAccount = targets.filter((x) => !x.user_id).length;
        if (noAccount) note = `${noAccount} thành viên chưa có tài khoản nên chưa nhận được thông báo trong ứng dụng.`;
      }
      await supabase.from("shcm_meetings").update({ format_notified_at: new Date().toISOString() }).eq("id", meetingId);
    }
  }
  revalidatePath("/lich-sinh-hoat");
  revalidatePath("/bien-ban/[id]", "page");
  revalidatePath("/");
  return { ok: true, sent, emailed, note };
}

export async function markNotificationsRead(ids?: string[]): Promise<{ ok: boolean; error?: string }> {
  const me = await requireMember();
  const supabase = await createClient();
  let q = supabase.from("shcm_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.id).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/thong-bao");
  revalidatePath("/", "layout");
  return { ok: true };
}
