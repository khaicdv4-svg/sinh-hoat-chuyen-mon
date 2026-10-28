export type Role = "giao_vien" | "to_truong" | "quan_li" | "cum";
export type Editors = "all" | "leader" | "assigned";
export type FilesMode = "none" | "evidence" | "viewer";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  is_admin: boolean;
  status: "pending" | "approved" | "rejected";
}

export interface Meeting {
  id: string;
  title: string;
  kind: "sinh_hoat" | "khac";
  week_from: number | null;
  week_to: number | null;
  meeting_date: string | null;
  meeting_time: string | null;
  place: string | null;
  status: "open" | "locked";
  secretary_id: string | null;
  attendance_note: string | null;
  subject: string | null;
  topic: string | null;
  position: number;
  locked_at: string | null;
  chair_member_id: string | null;
  secretary_member_id: string | null;
  end_time: string | null;
  vote_agree: number | null;
  vote_total: number | null;
  vote_other: string | null;
  ncbh_stage: string | null;
}

export interface Member {
  id: string;
  honorific: "Thầy" | "Cô";
  full_name: string;
  title: string | null;
  email: string | null;
  user_id: string | null;
  is_chair: boolean;
  sort_order: number;
  active: boolean;
}

export interface Attendance {
  meeting_id: string;
  member_id: string;
  present: boolean;
  reason: string | null;
}

export interface Section {
  id: string;
  meeting_id: string;
  key: string;
  title: string;
  hint: string | null;
  position: number;
  entry_editors: Editors;
  file_editors: Editors;
  files_mode: FilesMode;
  file_label: string | null;
  ai_action: string;
  assignee_id: string | null;
  part: string | null;
  layout: "block" | "inline" | "list";
  allow_opinions: boolean;
  opinion_label: string | null;
  numbered: boolean;
}

export interface Entry {
  id: string;
  section_id: string;
  author_id: string | null;
  body: string;
  source: "manual" | "ai_assisted" | "ke_hoach" | "van_ban_moi" | "ai_summary" | "nhap_file";
  speaker_id: string | null;
  source_file_id: string | null;
  status: "proposed" | "accepted" | "pending" | "merged" | "dismissed";
  kind: "noi_dung" | "y_kien";
  created_at: string;
  updated_at: string;
  author?: { full_name: string | null } | null;
}

export interface FileRow {
  id: string;
  kind: "ke_hoach" | "van_ban_moi" | "mau_bien_ban" | "minh_chung" | "nhap_bien_ban";
  meeting_id: string | null;
  section_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  applied_at: string | null;
  applied_scope: string | null;
  created_at: string;
  uploader?: { full_name: string | null } | null;
}

export interface CalendarWeek {
  week_no: number;
  week_start: string;
  note: string | null;
}

export interface TemplateSection {
  key: string;
  title: string;
  hint?: string | null;
  entry_editors: Editors;
  file_editors: Editors;
  files_mode: FilesMode;
  file_label?: string | null;
  ai_action?: string;
  position?: number;
  part?: string | null;
  layout?: "block" | "inline" | "list";
  allow_opinions?: boolean;
  opinion_label?: string | null;
  numbered?: boolean;
}

export interface Template {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  sections: TemplateSection[];
  is_system: boolean;
}
