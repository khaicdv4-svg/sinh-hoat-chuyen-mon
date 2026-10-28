import { notFound } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/constants";
import { groupByPart, partLabel } from "@/lib/format";
import type { Attendance, CalendarWeek, Entry, FileRow, Meeting, Member, Profile, Section, Template } from "@/lib/types";
import MeetingHeader from "@/components/MeetingHeader";
import SectionCard from "@/components/SectionCard";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const supabase = await createClient();

  const { data: meetingRow } = await supabase.from("shcm_meetings").select("*").eq("id", id).maybeSingle();
  if (!meetingRow) notFound();
  const meeting = meetingRow as Meeting;

  const [secRes, profRes, memRes, attRes, calRes, tplRes] = await Promise.all([
    supabase.from("shcm_sections").select("*").eq("meeting_id", id).order("position"),
    supabase.from("shcm_profiles").select("id, email, full_name, role, status, is_admin, avatar_url").eq("status", "approved").order("full_name"),
    supabase.from("shcm_members").select("*").order("sort_order"),
    supabase.from("shcm_attendance").select("*").eq("meeting_id", id),
    supabase.from("shcm_calendar").select("*").order("week_no"),
    me.role === "to_truong" ? supabase.from("shcm_templates").select("*").order("name") : Promise.resolve({ data: [] }),
  ]);
  const sections = (secRes.data ?? []) as Section[];
  const profiles = (profRes.data ?? []) as Profile[];
  const members = (memRes.data ?? []) as Member[];
  const sectionIds = sections.map((s) => s.id);

  const [entRes, fileRes] = await Promise.all([
    sectionIds.length
      ? supabase.from("shcm_entries").select("*, author:author_id(full_name, email)").in("section_id", sectionIds).order("created_at")
      : Promise.resolve({ data: [] }),
    sectionIds.length
      ? supabase.from("shcm_files").select("*, uploader:uploaded_by(full_name, email)").in("section_id", sectionIds).eq("kind", "minh_chung").order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const entries = (entRes.data ?? []) as unknown as Entry[];
  const files = (fileRes.data ?? []) as unknown as FileRow[];

  const urls: Record<string, string> = {};
  if (files.length) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(files.map((f) => f.storage_path), 3600);
    signed?.forEach((s, i) => {
      if (s.signedUrl) urls[files[i].id] = s.signedUrl;
    });
  }

  const locked = meeting.status === "locked";
  const leader = me.role === "to_truong";
  const myMember = members.find((m) => m.user_id === me.id) ?? null;
  const secretary = !!myMember && meeting.secretary_member_id === myMember.id && (me.role === "giao_vien" || leader);
  const templates = ((tplRes.data ?? []) as Template[]).filter((t) => t.key !== "khung_sh");
  const proposals = entries.filter((e) => e.status === "proposed").length;
  const pendingOpinions = entries.filter((e) => e.status === "pending").length;
  const groups = groupByPart(sections);

  return (
    <div>
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Danh sách biên bản
      </Link>
      <MeetingHeader
        meeting={meeting}
        members={members}
        attendance={(attRes.data ?? []) as Attendance[]}
        calendar={(calRes.data ?? []) as CalendarWeek[]}
        leader={leader}
        secretary={secretary}
        templates={templates}
        proposals={proposals}
        pendingOpinions={pendingOpinions}
        me={me.id}
      />
      <div className="mt-5 grid gap-6">
        {groups.map((g, gi) => (
          <div key={gi} className="grid gap-3">
            {g.part && <h2 className="section-title justify-self-start uppercase tracking-wide">{partLabel(g.part, meeting.week_from, meeting.week_to)}</h2>}
            {g.items.map(({ s, no }) => (
              <SectionCard
                key={s.id}
                no={g.part && s.layout !== "list" && no > 0 ? no : null}
                section={s}
                entries={entries.filter((e) => e.section_id === s.id)}
                files={files.filter((f) => f.section_id === s.id)}
                urls={urls}
                profiles={profiles}
                members={members}
                myMember={myMember}
                me={me}
                secretary={secretary}
                locked={locked}
                meetingId={id}
              />
            ))}
          </div>
        ))}
        {!sections.length && <p className="text-sm text-gray-500">Biên bản chưa có đề mục nào.</p>}
      </div>
    </div>
  );
}
