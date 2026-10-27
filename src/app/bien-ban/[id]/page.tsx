import { notFound } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/constants";
import type { CalendarWeek, Entry, FileRow, Meeting, Profile, Section, Template } from "@/lib/types";
import MeetingHeader from "@/components/MeetingHeader";
import SectionCard from "@/components/SectionCard";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const supabase = await createClient();

  const { data: meeting } = await supabase.from("shcm_meetings").select("*").eq("id", id).maybeSingle();
  if (!meeting) notFound();

  const [secRes, memRes, calRes, tplRes] = await Promise.all([
    supabase.from("shcm_sections").select("*").eq("meeting_id", id).order("position"),
    supabase.from("shcm_profiles").select("id, email, full_name, role, status, is_admin, avatar_url").eq("status", "approved").order("full_name"),
    supabase.from("shcm_calendar").select("*").order("week_no"),
    me.role === "to_truong" ? supabase.from("shcm_templates").select("*").order("name") : Promise.resolve({ data: [] }),
  ]);
  const sections = (secRes.data ?? []) as Section[];
  const members = (memRes.data ?? []) as Profile[];
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

  const locked = (meeting as Meeting).status === "locked";
  const leader = me.role === "to_truong";
  const templates = ((tplRes.data ?? []) as Template[]).filter((t) => t.key !== "base_dau" && t.key !== "ket_luan");

  return (
    <div>
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Danh sách biên bản
      </Link>
      <MeetingHeader
        meeting={meeting as Meeting}
        members={members}
        calendar={(calRes.data ?? []) as CalendarWeek[]}
        leader={leader}
        templates={templates}
      />
      <div className="mt-5 grid gap-4">
        {sections.map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            entries={entries.filter((e) => e.section_id === s.id)}
            files={files.filter((f) => f.section_id === s.id)}
            urls={urls}
            members={members}
            me={me}
            locked={locked}
            meetingId={id}
          />
        ))}
        {!sections.length && <p className="text-sm text-gray-500">Biên bản chưa có đề mục nào.</p>}
      </div>
    </div>
  );
}
