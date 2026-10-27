-- Module Sinh hoạt chuyên môn (shcm) - migration khởi tạo
-- Tất cả bảng có tiền tố shcm_ nên chạy chung được với dự án khác trong cùng cơ sở dữ liệu.
-- Chạy một lần. Cần: schema auth, storage của Supabase.

------------------------------------------------------------------
-- 1. Bảng
------------------------------------------------------------------
create table public.shcm_settings (
  key text primary key,
  value text not null
);
alter table public.shcm_settings enable row level security;
revoke all on public.shcm_settings from anon, authenticated;
-- Tài khoản này tự động được duyệt, làm tổ trưởng và quản trị khi đăng nhập lần đầu.
insert into public.shcm_settings (key, value) values ('owner_email', 'khaicdv4@gmail.com');

create table public.shcm_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'giao_vien' check (role in ('giao_vien', 'to_truong', 'quan_li', 'cum')),
  is_admin boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.shcm_calendar (
  week_no int primary key,
  week_start date not null,
  note text
);

create table public.shcm_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'sinh_hoat' check (kind in ('sinh_hoat', 'khac')),
  week_from int,
  week_to int,
  meeting_date date,
  meeting_time time default '14:00',
  place text default 'Phòng họp lầu 1',
  status text not null default 'open' check (status in ('open', 'locked')),
  secretary_id uuid references public.shcm_profiles (id) on delete set null,
  attendance_note text,
  subject text,
  topic text,
  position int not null default 0,
  locked_at timestamptz,
  locked_by uuid references public.shcm_profiles (id) on delete set null,
  created_by uuid references public.shcm_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.shcm_sections (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.shcm_meetings (id) on delete cascade,
  key text not null,
  title text not null,
  hint text,
  position int not null default 0,
  entry_editors text not null default 'all' check (entry_editors in ('all', 'leader', 'assigned')),
  file_editors text not null default 'leader' check (file_editors in ('all', 'leader', 'assigned')),
  files_mode text not null default 'none' check (files_mode in ('none', 'evidence', 'viewer')),
  file_label text,
  ai_action text not null default 'none',
  assignee_id uuid references public.shcm_profiles (id) on delete set null,
  unique (meeting_id, key)
);
create index shcm_sections_meeting_idx on public.shcm_sections (meeting_id, position);

create table public.shcm_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.shcm_sections (id) on delete cascade,
  author_id uuid references public.shcm_profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 8000),
  source text not null default 'manual' check (source in ('manual', 'ai_assisted', 'ke_hoach', 'van_ban_moi', 'ai_summary')),
  source_file_id uuid,
  status text not null default 'accepted' check (status in ('proposed', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shcm_entries_section_idx on public.shcm_entries (section_id, created_at);

create table public.shcm_files (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ke_hoach', 'van_ban_moi', 'mau_bien_ban', 'minh_chung')),
  meeting_id uuid references public.shcm_meetings (id) on delete cascade,
  section_id uuid references public.shcm_sections (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.shcm_profiles (id) on delete set null,
  applied_at timestamptz,
  applied_scope text,
  created_at timestamptz not null default now()
);
create index shcm_files_section_idx on public.shcm_files (section_id);
create index shcm_files_meeting_idx on public.shcm_files (meeting_id);

create table public.shcm_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null,
  description text,
  sections jsonb not null,
  is_system boolean not null default false,
  created_by uuid references public.shcm_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.shcm_audit (
  id bigint generated always as identity primary key,
  meeting_id uuid references public.shcm_meetings (id) on delete set null,
  user_id uuid references public.shcm_profiles (id) on delete set null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table public.shcm_ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.shcm_profiles (id) on delete cascade,
  feature text not null,
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);
create index shcm_ai_usage_user_idx on public.shcm_ai_usage (user_id, created_at);

------------------------------------------------------------------
-- 2. Hàm hỗ trợ
------------------------------------------------------------------
create function public.shcm_is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shcm_profiles p where p.id = auth.uid() and p.status = 'approved')
$$;

create function public.shcm_is_leader() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shcm_profiles p
                 where p.id = auth.uid() and p.status = 'approved' and p.role = 'to_truong')
$$;

create function public.shcm_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shcm_profiles p
                 where p.id = auth.uid() and p.status = 'approved' and p.is_admin)
$$;

create function public.shcm_can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shcm_profiles p
                 where p.id = auth.uid() and p.status = 'approved' and p.role in ('giao_vien', 'to_truong'))
$$;

-- p_what: 'entry' hoặc 'file'
create function public.shcm_section_allows(p_section uuid, p_what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shcm_sections s
    where s.id = p_section
      and (
        public.shcm_is_leader()
        or (case when p_what = 'entry' then s.entry_editors else s.file_editors end) = 'all'
        or ((case when p_what = 'entry' then s.entry_editors else s.file_editors end) = 'assigned'
            and s.assignee_id = auth.uid())
      )
  )
$$;

create function public.shcm_ensure_profile() returns public.shcm_profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_owner text;
  v_is_owner boolean;
  v_row public.shcm_profiles;
begin
  if v_uid is null then
    raise exception 'Chưa đăng nhập';
  end if;
  select lower(value) into v_owner from public.shcm_settings where key = 'owner_email';
  v_is_owner := (v_email <> '' and v_email = v_owner);
  insert into public.shcm_profiles (id, email, full_name, avatar_url, role, is_admin, status)
  values (
    v_uid, v_email,
    coalesce(v_meta ->> 'full_name', v_meta ->> 'name', split_part(v_email, '@', 1)),
    v_meta ->> 'avatar_url',
    case when v_is_owner then 'to_truong' else 'giao_vien' end,
    v_is_owner,
    case when v_is_owner then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;
  select * into v_row from public.shcm_profiles where id = v_uid;
  return v_row;
end $$;

create function public.shcm_set_member(p_user uuid, p_role text, p_status text, p_admin boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.shcm_is_admin() then
    raise exception 'Chỉ quản trị mới duyệt tài khoản';
  end if;
  if p_role not in ('giao_vien', 'to_truong', 'quan_li', 'cum') then
    raise exception 'Vai trò không hợp lệ';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Trạng thái không hợp lệ';
  end if;
  if p_user = auth.uid() and (not p_admin or p_status <> 'approved') then
    raise exception 'Không tự gỡ quyền quản trị của chính mình';
  end if;
  update public.shcm_profiles
     set role = p_role, status = p_status, is_admin = p_admin
   where id = p_user;
end $$;

------------------------------------------------------------------
-- 3. Khóa biên bản: biên bản đã khóa không sửa được (kể cả tổ trưởng, phải mở khóa trước)
------------------------------------------------------------------
create function public.shcm_trg_meetings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'locked' and new.status = 'locked' then
    raise exception 'Biên bản đã khóa, không sửa được. Hãy mở khóa trước.';
  end if;
  if new.status = 'locked' and old.status <> 'locked' then
    new.locked_at := now();
    new.locked_by := auth.uid();
  elsif new.status = 'open' and old.status = 'locked' then
    new.locked_at := null;
    new.locked_by := null;
  end if;
  return new;
end $$;
create trigger shcm_meetings_guard before update on public.shcm_meetings
  for each row execute function public.shcm_trg_meetings_guard();

create function public.shcm_trg_meetings_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.shcm_audit (meeting_id, user_id, action, detail)
    values (new.id, auth.uid(),
            case when new.status = 'locked' then 'khoa_bien_ban' else 'mo_khoa_bien_ban' end,
            jsonb_build_object('title', new.title));
  end if;
  return null;
end $$;
create trigger shcm_meetings_audit after update on public.shcm_meetings
  for each row execute function public.shcm_trg_meetings_audit();

create function public.shcm_trg_sections_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_meeting uuid;
begin
  if tg_op = 'DELETE' then v_meeting := old.meeting_id; else v_meeting := new.meeting_id; end if;
  if exists (select 1 from public.shcm_meetings m where m.id = v_meeting and m.status = 'locked') then
    raise exception 'Biên bản đã khóa, không sửa được.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger shcm_sections_lock before insert or update or delete on public.shcm_sections
  for each row execute function public.shcm_trg_sections_lock();

create function public.shcm_trg_entries_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_section uuid;
begin
  if tg_op = 'DELETE' then v_section := old.section_id; else v_section := new.section_id; end if;
  if exists (
    select 1 from public.shcm_sections s
    join public.shcm_meetings m on m.id = s.meeting_id
    where s.id = v_section and m.status = 'locked'
  ) then
    raise exception 'Biên bản đã khóa, không sửa được.';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger shcm_entries_lock before insert or update or delete on public.shcm_entries
  for each row execute function public.shcm_trg_entries_lock();

create function public.shcm_trg_files_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meeting uuid;
  v_section uuid;
begin
  if tg_op = 'DELETE' then
    v_meeting := old.meeting_id; v_section := old.section_id;
  else
    v_meeting := new.meeting_id; v_section := new.section_id;
  end if;
  if v_meeting is null and v_section is not null then
    select s.meeting_id into v_meeting from public.shcm_sections s where s.id = v_section;
  end if;
  if v_meeting is not null and exists (
    select 1 from public.shcm_meetings m where m.id = v_meeting and m.status = 'locked'
  ) then
    raise exception 'Biên bản đã khóa, không sửa được.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger shcm_files_lock before insert or update or delete on public.shcm_files
  for each row execute function public.shcm_trg_files_lock();

------------------------------------------------------------------
-- 4. RLS
------------------------------------------------------------------
alter table public.shcm_profiles enable row level security;
alter table public.shcm_calendar enable row level security;
alter table public.shcm_meetings enable row level security;
alter table public.shcm_sections enable row level security;
alter table public.shcm_entries enable row level security;
alter table public.shcm_files enable row level security;
alter table public.shcm_templates enable row level security;
alter table public.shcm_audit enable row level security;
alter table public.shcm_ai_usage enable row level security;

revoke all on public.shcm_profiles, public.shcm_calendar, public.shcm_meetings, public.shcm_sections,
  public.shcm_entries, public.shcm_files, public.shcm_templates, public.shcm_audit, public.shcm_ai_usage
  from anon;

-- Hồ sơ: chỉ sửa được họ tên của chính mình; vai trò và trạng thái chỉ đổi qua shcm_set_member (quản trị)
revoke insert, update, delete on public.shcm_profiles from authenticated;
grant update (full_name) on public.shcm_profiles to authenticated;

create policy shcm_profiles_select on public.shcm_profiles for select to authenticated
  using (id = (select auth.uid())
         or (public.shcm_is_approved() and status = 'approved')
         or public.shcm_is_admin());
create policy shcm_profiles_update_self on public.shcm_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Lịch năm học: mọi thành viên đã duyệt được xem
revoke insert, update, delete on public.shcm_calendar from authenticated;
create policy shcm_calendar_select on public.shcm_calendar for select to authenticated
  using (public.shcm_is_approved());

-- Biên bản
create policy shcm_meetings_select on public.shcm_meetings for select to authenticated
  using (public.shcm_is_approved());
create policy shcm_meetings_insert on public.shcm_meetings for insert to authenticated
  with check (public.shcm_is_leader());
create policy shcm_meetings_update on public.shcm_meetings for update to authenticated
  using (public.shcm_is_leader()) with check (public.shcm_is_leader());
create policy shcm_meetings_delete on public.shcm_meetings for delete to authenticated
  using (public.shcm_is_leader() and status = 'open');

-- Đề mục
create policy shcm_sections_select on public.shcm_sections for select to authenticated
  using (public.shcm_is_approved());
create policy shcm_sections_insert on public.shcm_sections for insert to authenticated
  with check (public.shcm_is_leader());
create policy shcm_sections_update on public.shcm_sections for update to authenticated
  using (public.shcm_is_leader()) with check (public.shcm_is_leader());
create policy shcm_sections_delete on public.shcm_sections for delete to authenticated
  using (public.shcm_is_leader());

-- Ý kiến: đề xuất của AI (proposed) chỉ tổ trưởng thấy
create policy shcm_entries_select on public.shcm_entries for select to authenticated
  using (public.shcm_is_approved() and (status = 'accepted' or public.shcm_is_leader()));
create policy shcm_entries_insert on public.shcm_entries for insert to authenticated
  with check (
    public.shcm_is_leader()
    or (author_id = (select auth.uid())
        and status = 'accepted'
        and source in ('manual', 'ai_assisted')
        and public.shcm_can_write()
        and public.shcm_section_allows(section_id, 'entry'))
  );
create policy shcm_entries_update on public.shcm_entries for update to authenticated
  using (public.shcm_is_leader() or (author_id = (select auth.uid()) and public.shcm_can_write()))
  with check (
    public.shcm_is_leader()
    or (author_id = (select auth.uid()) and status = 'accepted' and public.shcm_can_write())
  );
create policy shcm_entries_delete on public.shcm_entries for delete to authenticated
  using (public.shcm_is_leader() or (author_id = (select auth.uid()) and public.shcm_can_write()));

-- Tệp: kế hoạch, văn bản mới, mẫu biên bản chỉ tổ trưởng thấy; minh chứng cả tổ thấy
create policy shcm_files_select on public.shcm_files for select to authenticated
  using (public.shcm_is_approved() and (kind = 'minh_chung' or public.shcm_is_leader()));
create policy shcm_files_insert on public.shcm_files for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (kind in ('ke_hoach', 'van_ban_moi', 'mau_bien_ban') and public.shcm_is_leader())
      or (kind = 'minh_chung' and public.shcm_can_write() and section_id is not null
          and public.shcm_section_allows(section_id, 'file'))
    )
  );
create policy shcm_files_update on public.shcm_files for update to authenticated
  using (public.shcm_is_leader()) with check (public.shcm_is_leader());
create policy shcm_files_delete on public.shcm_files for delete to authenticated
  using (public.shcm_is_leader() or (uploaded_by = (select auth.uid()) and public.shcm_can_write()));

-- Mẫu đề mục
create policy shcm_templates_select on public.shcm_templates for select to authenticated
  using (public.shcm_is_approved());
create policy shcm_templates_insert on public.shcm_templates for insert to authenticated
  with check (public.shcm_is_leader() and not is_system);
create policy shcm_templates_update on public.shcm_templates for update to authenticated
  using (public.shcm_is_leader() and not is_system) with check (public.shcm_is_leader() and not is_system);
create policy shcm_templates_delete on public.shcm_templates for delete to authenticated
  using (public.shcm_is_leader() and not is_system);

-- Nhật ký
create policy shcm_audit_select on public.shcm_audit for select to authenticated
  using (public.shcm_is_leader());
create policy shcm_audit_insert on public.shcm_audit for insert to authenticated
  with check (public.shcm_is_leader() and user_id = (select auth.uid()));
revoke update, delete on public.shcm_audit from authenticated;

-- Lượt dùng AI
create policy shcm_ai_usage_select on public.shcm_ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or public.shcm_is_admin());
create policy shcm_ai_usage_insert on public.shcm_ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()) and public.shcm_can_write());
revoke update, delete on public.shcm_ai_usage from authenticated;

-- Quyền gọi hàm
revoke execute on function public.shcm_is_approved(), public.shcm_is_leader(), public.shcm_is_admin(),
  public.shcm_can_write(), public.shcm_section_allows(uuid, text), public.shcm_ensure_profile(),
  public.shcm_set_member(uuid, text, text, boolean) from public, anon;
grant execute on function public.shcm_is_approved(), public.shcm_is_leader(), public.shcm_is_admin(),
  public.shcm_can_write(), public.shcm_section_allows(uuid, text), public.shcm_ensure_profile(),
  public.shcm_set_member(uuid, text, text, boolean) to authenticated;

------------------------------------------------------------------
-- 5. Kho tệp (Storage)
------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('shcm-files', 'shcm-files', false, 52428800)
on conflict (id) do nothing;

create policy shcm_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'shcm-files' and public.shcm_is_approved()
    and ((storage.foldername(name))[1] = 'evidence' or public.shcm_is_leader())
  );
create policy shcm_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shcm-files'
    and (
      ((storage.foldername(name))[1] = 'evidence' and public.shcm_can_write())
      or ((storage.foldername(name))[1] = 'leader' and public.shcm_is_leader())
    )
  );
create policy shcm_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'shcm-files'
    and (public.shcm_is_leader() or (owner_id = (select auth.uid())::text and public.shcm_can_write()))
  );

------------------------------------------------------------------
-- 6. Dữ liệu khởi tạo: lịch năm học 2026-2027 (QĐ 5067/QĐ-UBND ngày 11/8/2026)
------------------------------------------------------------------
insert into public.shcm_calendar (week_no, week_start)
select n,
       case when n <= 21 then date '2026-09-07' + (n - 1) * 7
            else date '2027-02-15' + (n - 22) * 7 end
from generate_series(1, 35) as n;

update public.shcm_calendar set note = 'Kiểm tra định kì giữa học kì I (lớp 4, 5)' where week_no = 9;
update public.shcm_calendar set note = 'Ôn tập; kiểm tra cuối học kì I một số môn' where week_no = 16;
update public.shcm_calendar set note = 'Kiểm tra định kì cuối học kì I' where week_no in (17, 18);
update public.shcm_calendar set note = 'Bắt đầu học kì II' where week_no = 19;
update public.shcm_calendar set note = 'Học lại sau nghỉ Tết (nghỉ từ 1/2 đến 14/2)' where week_no = 22;
update public.shcm_calendar set note = 'Kiểm tra định kì giữa học kì II (lớp 4, 5)' where week_no = 27;
update public.shcm_calendar set note = 'Ôn tập cuối học kì II' where week_no = 33;
update public.shcm_calendar set note = 'Kiểm tra định kì cuối học kì II' where week_no in (34, 35);

------------------------------------------------------------------
-- 7. Mẫu đề mục dựng sẵn
------------------------------------------------------------------
insert into public.shcm_templates (key, name, description, sections, is_system) values
('base_dau', 'Phần đầu mọi buổi sinh hoạt', 'Nhiệm vụ của thời điểm và việc chung của tổ', $json$[
 {"key":"nhiem_vu","title":"Nhiệm vụ của thời điểm","hint":"Việc cần làm trong tuần hoặc tháng này, chia từ kế hoạch năm và văn bản mới.","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"none","position":10},
 {"key":"viec_chung","title":"Việc chung của tổ","hint":"Triển khai nhiệm vụ, tiến độ chương trình, học sinh cần theo dõi, việc sắp tới.","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"none","position":20}
]$json$::jsonb, true),
('ncbh', 'Nghiên cứu bài học', 'Chu trình 4 bước: xây dựng bài học, dạy minh họa, thảo luận, vận dụng', $json$[
 {"key":"ncbh_b1","title":"Bước 1. Xây dựng bài học","hint":"Người được phân công tải kế hoạch bài dạy; các thành viên góp ý bên dưới.","entry_editors":"all","file_editors":"assigned","files_mode":"viewer","file_label":"Kế hoạch bài dạy","ai_action":"tom_tat_gop_y","position":100},
 {"key":"ncbh_b2","title":"Bước 2. Thực hành dạy","hint":"Người dạy tải minh chứng tiết dạy: tệp, ảnh, clip ngắn. Không chấm điểm, không xếp loại giờ dạy.","entry_editors":"assigned","file_editors":"assigned","files_mode":"evidence","file_label":"Minh chứng tiết dạy","ai_action":"none","position":110},
 {"key":"ncbh_b3","title":"Bước 3. Thảo luận, phân tích tiết dạy","hint":"Ghi nhận ý kiến của mọi thành viên, dựa trên điều quan sát được ở học sinh.","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":120},
 {"key":"ncbh_b4","title":"Bước 4. Vận dụng","hint":"Giáo viên báo cáo kết quả áp dụng điều đã thống nhất, kèm minh chứng.","entry_editors":"all","file_editors":"all","files_mode":"evidence","file_label":"Minh chứng vận dụng","ai_action":"tong_hop_ket_qua","position":130}
]$json$::jsonb, true),
('chuyen_de', 'Chuyên đề', 'Nghiên cứu một vấn đề chuyên môn rộng hơn, không bắt buộc có tiết dạy minh họa', $json$[
 {"key":"cd_van_de","title":"Vấn đề của chuyên đề","hint":"Tên chuyên đề, vấn đề cần giải quyết, lý do chọn, số liệu hoặc minh chứng ban đầu.","entry_editors":"assigned","file_editors":"assigned","files_mode":"evidence","file_label":"Minh chứng ban đầu","ai_action":"none","position":200},
 {"key":"cd_nghien_cuu","title":"Nội dung nghiên cứu","hint":"Người được phân công tải tài liệu hoặc bài trình bày; các thành viên góp ý bên dưới.","entry_editors":"all","file_editors":"assigned","files_mode":"viewer","file_label":"Tài liệu nghiên cứu","ai_action":"tom_tat_gop_y","position":210},
 {"key":"cd_thao_luan","title":"Thảo luận, đề xuất giải pháp","hint":"Ghi nhận ý kiến của mọi thành viên.","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":220},
 {"key":"cd_giai_phap","title":"Giải pháp thống nhất","hint":"Giải pháp tổ chọn, ai làm, làm ở lớp nào.","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"du_thao_giai_phap","position":230},
 {"key":"cd_san_pham","title":"Sản phẩm dùng chung","hint":"Học liệu, tiêu chí, phiếu hoặc bộ câu hỏi dùng chung của tổ.","entry_editors":"assigned","file_editors":"assigned","files_mode":"evidence","file_label":"Sản phẩm dùng chung","ai_action":"none","position":240},
 {"key":"cd_ap_dung","title":"Áp dụng","hint":"Kế hoạch áp dụng ở từng lớp, sau đó báo cáo kết quả kèm minh chứng.","entry_editors":"all","file_editors":"all","files_mode":"evidence","file_label":"Minh chứng áp dụng","ai_action":"tong_hop_ket_qua","position":250}
]$json$::jsonb, true),
('thong_nhat_de', 'Thống nhất đề kiểm tra', 'Biên bản họp thống nhất ma trận, đề, đáp án', $json$[
 {"key":"de_thong_tin","title":"Thông tin đề kiểm tra","hint":"Môn, đợt kiểm tra, thời gian làm bài, hình thức.","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"none","position":300},
 {"key":"de_ma_tran","title":"Ma trận và đặc tả","hint":"Tải ma trận của tổ; các thành viên góp ý bên dưới.","entry_editors":"all","file_editors":"assigned","files_mode":"viewer","file_label":"Ma trận","ai_action":"tom_tat_gop_y","position":310},
 {"key":"de_de","title":"Đề kiểm tra","hint":"Tải đề; các thành viên góp ý bên dưới.","entry_editors":"all","file_editors":"assigned","files_mode":"viewer","file_label":"Đề kiểm tra","ai_action":"tom_tat_gop_y","position":320},
 {"key":"de_dap_an","title":"Đáp án và hướng dẫn chấm","hint":"Tải đáp án; các thành viên góp ý bên dưới.","entry_editors":"all","file_editors":"assigned","files_mode":"viewer","file_label":"Đáp án","ai_action":"tom_tat_gop_y","position":330},
 {"key":"de_gop_y","title":"Ý kiến góp ý của giáo viên","hint":"Ghi nhận ý kiến của từng giáo viên về ma trận, đề và đáp án.","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":340},
 {"key":"de_thong_nhat","title":"Nội dung thống nhất chỉnh sửa","hint":"Những chỗ tổ thống nhất sửa, ai sửa, hạn hoàn thành.","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"du_thao_giai_phap","position":350}
]$json$::jsonb, true),
('ket_luan', 'Kết luận', 'Kết luận của tổ trưởng', $json$[
 {"key":"ket_luan","title":"Kết luận của tổ trưởng","hint":"Kết luận cuối buổi, phân công việc tiếp theo.","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"du_thao_ket_luan","position":900}
]$json$::jsonb, true);

------------------------------------------------------------------
-- 8. 17 biên bản sinh hoạt theo cặp tuần (Tuần 1-2 đến Tuần 33-34), họp thứ Tư của tuần chẵn
------------------------------------------------------------------
insert into public.shcm_meetings (title, kind, week_from, week_to, meeting_date, position)
select 'Biên bản sinh hoạt chuyên môn Tổ 4, Tuần ' || (2 * i - 1) || '-' || (2 * i),
       'sinh_hoat', 2 * i - 1, 2 * i,
       (select c.week_start + 2 from public.shcm_calendar c where c.week_no = 2 * i),
       i
from generate_series(1, 17) as i;

insert into public.shcm_sections
  (meeting_id, key, title, hint, position, entry_editors, file_editors, files_mode, file_label, ai_action)
select m.id,
       e.elem ->> 'key', e.elem ->> 'title', e.elem ->> 'hint', (e.elem ->> 'position')::int,
       e.elem ->> 'entry_editors', e.elem ->> 'file_editors', e.elem ->> 'files_mode',
       e.elem ->> 'file_label', coalesce(e.elem ->> 'ai_action', 'none')
from public.shcm_meetings m
cross join lateral (
  select jsonb_array_elements(t.sections) as elem
  from public.shcm_templates t where t.key in ('base_dau', 'ket_luan')
) e;
