-- Module SHCM - v2: theo mẫu biên bản của Trường TH Trần Văn Ơn
-- Danh sách thành viên tổ, điểm danh, thư ký ghi thay, phần I-IV + C, nhập nội dung từ biên bản Word.

------------------------------------------------------------------
-- 1. Danh sách thành viên tổ (có thể chưa có tài khoản)
------------------------------------------------------------------
create table public.shcm_members (
  id uuid primary key default gen_random_uuid(),
  honorific text not null default 'Cô' check (honorific in ('Thầy', 'Cô')),
  full_name text not null check (char_length(full_name) between 2 and 120),
  title text,
  email text unique,
  user_id uuid unique references public.shcm_profiles (id) on delete set null,
  is_chair boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tự nối thành viên với tài khoản theo email
create function public.shcm_trg_members_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  if new.email is not null and (new.user_id is null or tg_op = 'UPDATE' and new.email is distinct from old.email) then
    new.user_id := (select p.id from public.shcm_profiles p where p.email = new.email limit 1);
  end if;
  return new;
end $$;
create trigger shcm_members_link before insert or update on public.shcm_members
  for each row execute function public.shcm_trg_members_link();

-- Lần đăng nhập đầu cũng nối vào thành viên có cùng email
create or replace function public.shcm_ensure_profile() returns public.shcm_profiles
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
  if v_email <> '' then
    update public.shcm_members set user_id = v_uid where email = v_email and user_id is null;
  end if;
  select * into v_row from public.shcm_profiles where id = v_uid;
  return v_row;
end $$;

------------------------------------------------------------------
-- 2. Cột mới
------------------------------------------------------------------
alter table public.shcm_meetings
  add column chair_member_id uuid references public.shcm_members (id) on delete set null,
  add column secretary_member_id uuid references public.shcm_members (id) on delete set null,
  add column end_time time,
  add column vote_agree int check (vote_agree >= 0),
  add column vote_total int check (vote_total >= 0),
  add column vote_other text,
  add column ncbh_stage text;

alter table public.shcm_sections
  add column part text,
  add column layout text not null default 'block' check (layout in ('block', 'inline', 'list'));

alter table public.shcm_entries
  add column speaker_id uuid references public.shcm_members (id) on delete set null;
create index shcm_entries_speaker_idx on public.shcm_entries (speaker_id);

alter table public.shcm_entries drop constraint shcm_entries_source_check;
alter table public.shcm_entries add constraint shcm_entries_source_check
  check (source in ('manual', 'ai_assisted', 'ke_hoach', 'van_ban_moi', 'ai_summary', 'nhap_file'));

alter table public.shcm_files drop constraint shcm_files_kind_check;
alter table public.shcm_files add constraint shcm_files_kind_check
  check (kind in ('ke_hoach', 'van_ban_moi', 'mau_bien_ban', 'minh_chung', 'nhap_bien_ban'));

create table public.shcm_attendance (
  meeting_id uuid not null references public.shcm_meetings (id) on delete cascade,
  member_id uuid not null references public.shcm_members (id) on delete cascade,
  present boolean not null default true,
  reason text,
  primary key (meeting_id, member_id)
);
create index shcm_attendance_member_idx on public.shcm_attendance (member_id);
create index shcm_meetings_chair_idx on public.shcm_meetings (chair_member_id);
create index shcm_meetings_secretary_idx on public.shcm_meetings (secretary_member_id);

------------------------------------------------------------------
-- 3. Thư ký của buổi họp được ghi biên bản thay các thành viên
------------------------------------------------------------------
create function public.shcm_is_secretary(p_meeting uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.shcm_can_write() and exists (
    select 1 from public.shcm_meetings m
    join public.shcm_members s on s.id = m.secretary_member_id
    where m.id = p_meeting and s.user_id = auth.uid()
  )
$$;

create function public.shcm_is_section_secretary(p_section uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shcm_sections s
    where s.id = p_section and public.shcm_is_secretary(s.meeting_id)
  )
$$;

create function public.shcm_my_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.shcm_members m where m.user_id = auth.uid() limit 1
$$;

create or replace function public.shcm_section_allows(p_section uuid, p_what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shcm_sections s
    where s.id = p_section
      and (
        public.shcm_is_leader()
        or public.shcm_is_secretary(s.meeting_id)
        or (case when p_what = 'entry' then s.entry_editors else s.file_editors end) = 'all'
        or ((case when p_what = 'entry' then s.entry_editors else s.file_editors end) = 'assigned'
            and s.assignee_id = auth.uid())
      )
  )
$$;

-- Ý kiến: giáo viên chỉ ghi dưới tên mình; thư ký/tổ trưởng được ghi thay
drop policy shcm_entries_insert on public.shcm_entries;
create policy shcm_entries_insert on public.shcm_entries for insert to authenticated
  with check (
    public.shcm_is_leader()
    or (author_id = (select auth.uid())
        and status = 'accepted'
        and source in ('manual', 'ai_assisted')
        and public.shcm_can_write()
        and public.shcm_section_allows(section_id, 'entry')
        and (speaker_id is null
             or speaker_id = public.shcm_my_member_id()
             or public.shcm_is_section_secretary(section_id)))
  );
drop policy shcm_entries_update on public.shcm_entries;
create policy shcm_entries_update on public.shcm_entries for update to authenticated
  using (public.shcm_is_leader() or (author_id = (select auth.uid()) and public.shcm_can_write()))
  with check (
    public.shcm_is_leader()
    or (author_id = (select auth.uid()) and status = 'accepted' and public.shcm_can_write()
        and (speaker_id is null
             or speaker_id = public.shcm_my_member_id()
             or public.shcm_is_section_secretary(section_id)))
  );

-- Biên bản: thư ký cập nhật giờ kết thúc, biểu quyết qua hàm riêng
create function public.shcm_set_minutes(p_meeting uuid, p_end_time time, p_vote_agree int, p_vote_total int, p_vote_other text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.shcm_is_leader() or public.shcm_is_secretary(p_meeting)) then
    raise exception 'Chỉ tổ trưởng hoặc thư ký buổi họp được cập nhật phần này';
  end if;
  update public.shcm_meetings
     set end_time = p_end_time, vote_agree = p_vote_agree, vote_total = p_vote_total,
         vote_other = nullif(trim(p_vote_other), '')
   where id = p_meeting;
end $$;

------------------------------------------------------------------
-- 4. Khóa biên bản áp dụng cho điểm danh
------------------------------------------------------------------
create function public.shcm_trg_attendance_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_meeting uuid;
begin
  if tg_op = 'DELETE' then v_meeting := old.meeting_id; else v_meeting := new.meeting_id; end if;
  if exists (select 1 from public.shcm_meetings m where m.id = v_meeting and m.status = 'locked') then
    raise exception 'Biên bản đã khóa, không sửa được.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger shcm_attendance_lock before insert or update or delete on public.shcm_attendance
  for each row execute function public.shcm_trg_attendance_lock();

------------------------------------------------------------------
-- 5. RLS cho bảng mới
------------------------------------------------------------------
alter table public.shcm_members enable row level security;
alter table public.shcm_attendance enable row level security;
revoke all on public.shcm_members, public.shcm_attendance from anon;

create policy shcm_members_select on public.shcm_members for select to authenticated
  using (public.shcm_is_approved());
create policy shcm_members_insert on public.shcm_members for insert to authenticated
  with check (public.shcm_is_leader());
create policy shcm_members_update on public.shcm_members for update to authenticated
  using (public.shcm_is_leader()) with check (public.shcm_is_leader());
create policy shcm_members_delete on public.shcm_members for delete to authenticated
  using (public.shcm_is_leader());

create policy shcm_attendance_select on public.shcm_attendance for select to authenticated
  using (public.shcm_is_approved());
create policy shcm_attendance_insert on public.shcm_attendance for insert to authenticated
  with check (public.shcm_is_leader() or public.shcm_is_secretary(meeting_id));
create policy shcm_attendance_update on public.shcm_attendance for update to authenticated
  using (public.shcm_is_leader() or public.shcm_is_secretary(meeting_id))
  with check (public.shcm_is_leader() or public.shcm_is_secretary(meeting_id));
create policy shcm_attendance_delete on public.shcm_attendance for delete to authenticated
  using (public.shcm_is_leader() or public.shcm_is_secretary(meeting_id));

revoke execute on function public.shcm_is_secretary(uuid), public.shcm_is_section_secretary(uuid),
  public.shcm_my_member_id(), public.shcm_set_minutes(uuid, time, int, int, text) from public, anon;
grant execute on function public.shcm_is_secretary(uuid), public.shcm_is_section_secretary(uuid),
  public.shcm_my_member_id(), public.shcm_set_minutes(uuid, time, int, int, text) to authenticated;
revoke execute on function public.shcm_trg_members_link(), public.shcm_trg_attendance_lock()
  from public, anon, authenticated;

------------------------------------------------------------------
-- 6. Thành viên Tổ 4 năm học 2026-2027 (theo biên bản của tổ)
------------------------------------------------------------------
insert into public.shcm_members (honorific, full_name, title, email, is_chair, sort_order) values
  ('Thầy', 'Võ Việt Khái', 'Tổ trưởng chuyên môn, GVCN lớp 4/1', 'khaicdv4@gmail.com', true, 1),
  ('Thầy', 'Nguyễn Thanh Hùng', 'GVCN lớp 4/2', null, false, 2),
  ('Cô', 'Võ Thị Huyền Trân', 'GVCN lớp 4/3', null, false, 3),
  ('Thầy', 'Nguyễn Thành Sơn', 'GVCN lớp 4/4', null, false, 4),
  ('Cô', 'Nguyễn Thị Mây Thu', 'Tổ phó chuyên môn, GVCN lớp 4/5', null, false, 5),
  ('Cô', 'Nguyễn Thị Thu Hiền', 'GVCN lớp 4/6', null, false, 6),
  ('Thầy', 'Lê Thanh Tùng', 'Giáo viên Tin học', null, false, 7);

------------------------------------------------------------------
-- 7. Mẫu đề mục theo khung biên bản của trường
--    {tuan} = tuần của buổi họp, {truoc} = hai tuần trước (thay khi hiển thị)
------------------------------------------------------------------
delete from public.shcm_templates where key in ('base_dau', 'ncbh', 'chuyen_de', 'ket_luan');

insert into public.shcm_templates (key, name, description, sections, is_system) values
('khung_sh', 'Khung biên bản sinh hoạt tổ', 'Phần I–IV và C theo mẫu biên bản của trường', $json$[
 {"key":"danh_gia_cm","part":"I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}","title":"Công tác chuyên môn","hint":"Việc thực hiện chương trình, kế hoạch bài dạy, hỗ trợ học sinh trong hai tuần qua.","layout":"inline","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":10},
 {"key":"danh_gia_cn","part":"I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}","title":"Công tác chủ nhiệm","hint":"Nền nếp, an toàn, phối hợp cha mẹ học sinh, cập nhật EnetViet, LMS, hồ sơ.","layout":"inline","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":20},
 {"key":"danh_gia_nv","part":"I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}","title":"Nhiệm vụ chuyên môn đã giao","hint":"Tình hình hoàn thành, nội dung cần điều chỉnh, người phụ trách.","layout":"inline","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":30},
 {"key":"chuong_trinh","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Thực hiện chương trình và hỗ trợ học sinh","hint":"Việc trong hai tuần này, chia từ kế hoạch năm; học sinh cần hỗ trợ.","layout":"block","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"none","position":100},
 {"key":"van_ban","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Triển khai văn bản mới","hint":"Văn bản mới và nội dung vận dụng tại tổ.","layout":"block","entry_editors":"leader","file_editors":"leader","files_mode":"evidence","file_label":"Văn bản","ai_action":"none","position":300},
 {"key":"phan_cong_tiep","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Phân công nghiên cứu bài học tiếp theo","hint":"Môn, bài, giáo viên thực hiện, thời gian.","layout":"block","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"none","position":380},
 {"key":"van_dung","part":"IV. VẬN DỤNG VÀ THEO DÕI SAU SINH HOẠT","title":"Vận dụng và theo dõi","hint":"Mỗi thành viên ghi việc mình vận dụng sau buổi sinh hoạt; buổi sau báo cáo kết quả kèm minh chứng.","layout":"list","entry_editors":"all","file_editors":"all","files_mode":"evidence","file_label":"Minh chứng vận dụng","ai_action":"tong_hop_ket_qua","position":400},
 {"key":"ket_luan","part":"C. BIỂU QUYẾT VÀ KẾT LUẬN","title":"Nội dung thống nhất","hint":"Kết luận của chủ trì. Số biểu quyết và giờ kết thúc ghi ở phần thông tin buổi họp.","layout":"inline","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"du_thao_ket_luan","position":900}
]$json$::jsonb, true),
('ncbh_12', 'NCBH: Bước 1–2 (xây dựng bài học, dạy minh họa)', 'Dùng cho buổi xây dựng bài học và dự giờ', $json$[
 {"key":"ncbh_thong_tin","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Nghiên cứu bài học","hint":"Đổi tên mục thành “Nghiên cứu bài học môn …”. Ghi bài nghiên cứu, giáo viên dạy minh họa.","layout":"block","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"none","position":110},
 {"key":"ncbh_b1","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Xây dựng bài học","hint":"Người được phân công tải kế hoạch bài dạy; các thành viên góp ý bên dưới.","layout":"block","entry_editors":"all","file_editors":"assigned","files_mode":"viewer","file_label":"Kế hoạch bài dạy","ai_action":"tom_tat_gop_y","position":115},
 {"key":"ncbh_b2","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Dạy minh họa và dự giờ","hint":"Người dạy tải minh chứng tiết dạy: ảnh, clip ngắn, sản phẩm học sinh. Không xếp loại tiết dạy.","layout":"block","entry_editors":"all","file_editors":"all","files_mode":"evidence","file_label":"Minh chứng tiết dạy","ai_action":"none","position":120}
]$json$::jsonb, true),
('ncbh_34', 'NCBH: Bước 3–4 (phân tích bài học, vận dụng)', 'Dùng cho buổi phân tích bài học từ minh chứng', $json$[
 {"key":"ncbh_thong_tin","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Nghiên cứu bài học","hint":"Đổi tên mục thành “Nghiên cứu bài học môn …”. Ghi bài nghiên cứu, giáo viên dạy minh họa.","layout":"block","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"none","position":110},
 {"key":"ncbh_phan_tich","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Phân tích bài học từ minh chứng","hint":"Ghi nhận cụ thể, nguyên nhân khó khăn, giải pháp điều chỉnh tổ thống nhất. Tải minh chứng: bài làm, ảnh, ghi chép dự giờ.","layout":"block","entry_editors":"leader","file_editors":"all","files_mode":"evidence","file_label":"Minh chứng phân tích","ai_action":"du_thao_giai_phap","position":125},
 {"key":"ncbh_y_kien","part":"II. SINH HOẠT CHUYÊN MÔN {tuan}","title":"Ý kiến trao đổi của các thành viên","hint":"Mỗi thành viên ghi ý kiến của mình, dựa trên điều quan sát được ở học sinh.","layout":"block","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":130}
]$json$::jsonb, true),
('chuyen_de', 'Sinh hoạt chuyên đề', 'Nghiên cứu một vấn đề chuyên môn, không bắt buộc có tiết dạy', $json$[
 {"key":"cd_noi_dung","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Sinh hoạt chuyên đề","hint":"Chủ đề, vấn đề cần giải quyết, người trình bày. Người được phân công tải tài liệu.","layout":"block","entry_editors":"leader","file_editors":"assigned","files_mode":"viewer","file_label":"Tài liệu chuyên đề","ai_action":"none","position":310},
 {"key":"cd_thao_luan","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Ý kiến trao đổi về chuyên đề","hint":"Ý kiến của từng thành viên.","layout":"block","entry_editors":"all","file_editors":"leader","files_mode":"none","ai_action":"gom_y_kien","position":320},
 {"key":"cd_giai_phap","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Giải pháp tổ thống nhất","hint":"Giải pháp, ai làm, làm ở lớp nào.","layout":"block","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"du_thao_giai_phap","position":330},
 {"key":"cd_san_pham","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Sản phẩm dùng chung","hint":"Học liệu, phiếu, tiêu chí dùng chung của tổ.","layout":"block","entry_editors":"assigned","file_editors":"assigned","files_mode":"evidence","file_label":"Sản phẩm","ai_action":"none","position":340}
]$json$::jsonb, true),
('tai_lieu', 'Giới thiệu tài liệu giáo dục', 'Một mục giới thiệu tài liệu trong phần III', $json$[
 {"key":"tai_lieu","part":"III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC","title":"Giới thiệu tài liệu giáo dục","hint":"Tên tài liệu, người giới thiệu, nội dung có thể dùng ở lớp.","layout":"block","entry_editors":"all","file_editors":"all","files_mode":"evidence","file_label":"Tài liệu","ai_action":"none","position":360}
]$json$::jsonb, true),
('ket_luan', 'Kết luận', 'Mục kết luận cho biên bản khác', $json$[
 {"key":"ket_luan","part":"C. BIỂU QUYẾT VÀ KẾT LUẬN","title":"Nội dung thống nhất","hint":"Kết luận của chủ trì.","layout":"inline","entry_editors":"leader","file_editors":"leader","files_mode":"none","ai_action":"du_thao_ket_luan","position":900}
]$json$::jsonb, true);

------------------------------------------------------------------
-- 8. Dựng lại đề mục cho 17 biên bản (chưa có nội dung) theo khung mới
------------------------------------------------------------------
delete from public.shcm_sections s
using public.shcm_meetings m
where s.meeting_id = m.id and m.kind = 'sinh_hoat' and m.status = 'open'
  and not exists (select 1 from public.shcm_entries e where e.section_id = s.id)
  and not exists (select 1 from public.shcm_files f where f.section_id = s.id);

insert into public.shcm_sections
  (meeting_id, key, title, hint, position, entry_editors, file_editors, files_mode, file_label, ai_action, part, layout)
select m.id,
       e.elem ->> 'key', e.elem ->> 'title', e.elem ->> 'hint', (e.elem ->> 'position')::int,
       e.elem ->> 'entry_editors', e.elem ->> 'file_editors', e.elem ->> 'files_mode',
       e.elem ->> 'file_label', coalesce(e.elem ->> 'ai_action', 'none'),
       e.elem ->> 'part', coalesce(e.elem ->> 'layout', 'block')
from public.shcm_meetings m
cross join lateral (
  select jsonb_array_elements(t.sections) as elem from public.shcm_templates t where t.key = 'khung_sh'
) e
where m.kind = 'sinh_hoat' and m.status = 'open'
on conflict (meeting_id, key) do nothing;

update public.shcm_meetings
   set chair_member_id = (select id from public.shcm_members where is_chair order by sort_order limit 1),
       place = case when place = 'Phòng họp lầu 1' then 'Phòng họp lầu 1, Trường Tiểu học Trần Văn Ơn' else place end
 where kind = 'sinh_hoat';
alter table public.shcm_meetings alter column place set default 'Phòng họp lầu 1, Trường Tiểu học Trần Văn Ơn';
