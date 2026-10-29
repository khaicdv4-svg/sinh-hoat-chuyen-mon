import Link from "next/link";
import { groupByPart, partLabel } from "@/lib/format";
import type { Attendance, CalendarWeek, Entry, FileRow, Meeting, Member, Profile, Section, Template } from "@/lib/types";
import MeetingHeader from "@/components/MeetingHeader";
import SectionCard from "@/components/SectionCard";
import ExportBar from "@/components/ExportBar";
import AiAssistant from "@/components/AiAssistant";

export type MeetingViewProps = {
  id: string; meeting: Meeting; sections: Section[]; entries: Entry[]; files: FileRow[]; urls: Record<string, string>;
  profiles: Profile[]; members: Member[]; attendance: Attendance[]; calendar: CalendarWeek[]; templates: Template[];
  me: Profile; myMember: Member | null; leader: boolean; secretary: boolean; locked: boolean;
  proposals: number; pendingOpinions: number;
  models: { id: string; label: string }[] | null; defaultModelId: string;
};

/** Giao diện một biên bản. Tách khỏi trang để dùng chung và kiểm thử được. */
export default function MeetingView({
  id, meeting, sections, entries, files, urls, profiles, members, attendance, calendar, templates, me, myMember, leader, secretary, locked,
  proposals, pendingOpinions, models, defaultModelId,
}: MeetingViewProps) {
  const groups = groupByPart(sections);
  // Thanh chọn mục tạo từ chính các phần của biên bản (I, II, III…; A, B, C…)
  const navParts = groups
    .map((g, gi) => ({ g, gi }))
    .filter(({ g }) => g.part)
    .map(({ g, gi }) => {
      const label = partLabel(g.part, meeting.week_from, meeting.week_to);
      const m = label.match(/^([IVXLC]+|[A-Z])\.\s*(.*)$/);
      return { id: `phan-${gi}`, label, short: m ? `${m[1]}. ${m[2].split(/\s+/).slice(0, 3).join(" ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}…` : label };
    });

  return (
    <div>
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Danh sách biên bản
      </Link>
      <MeetingHeader
        meeting={meeting}
        members={members}
        attendance={attendance}
        calendar={calendar}
        leader={leader}
        secretary={secretary}
        templates={templates}
        proposals={proposals}
        pendingOpinions={pendingOpinions}
        me={me.id}
      />
      {models && <AiAssistant meetingId={id} models={models} defaultModelId={defaultModelId} />}
      {navParts.length > 1 && (
        <nav className="partnav print:hidden" aria-label="Các mục của biên bản">
          {navParts.map((n) => <a key={n.id} href={`#${n.id}`} title={n.label}>{n.short}</a>)}
        </nav>
      )}
      <div className="mt-5 grid gap-6">
        {groups.map((g, gi) => (
          <div key={gi} id={g.part ? `phan-${gi}` : undefined} className="part-anchor grid gap-3">
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
      {leader && <ExportBar meetingId={id} locked={locked} />}
    </div>
  );
}
