-- Lịch sinh hoạt (hình thức họp trực tiếp / trực tuyến), thông báo cho thành viên, biểu mẫu cho AI tham khảo.
-- Chỉ thêm cột và bảng mới, không đổi dữ liệu cũ.

-- 1. Hình thức họp
alter table public.shcm_meetings
  add column if not exists format text check (format in ('truc_tiep', 'truc_tuyen')),
  add column if not exists online_platform text,
  add column if not exists online_link text,
  add column if not exists format_notified_at timestamptz;

-- 2. Biểu mẫu là một loại nguồn tư liệu mới
alter table public.shcm_sources drop constraint if exists shcm_sources_kind_check;
alter table public.shcm_sources
  add constraint shcm_sources_kind_check check (kind in ('ke_hoach', 'van_ban', 'lich', 'mau_bieu'));

-- 3. Thông báo trong ứng dụng. Mỗi người chỉ thấy và đánh dấu đã đọc thông báo của mình.
-- Việc tạo thông báo do máy chủ làm bằng khóa service role, nên không có chính sách insert.
create table if not exists public.shcm_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.shcm_profiles (id) on delete cascade,
  meeting_id uuid references public.shcm_meetings (id) on delete cascade,
  kind text not null default 'lich_hop',
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists shcm_notifications_user_idx on public.shcm_notifications (user_id, created_at desc);
alter table public.shcm_notifications enable row level security;
revoke all on public.shcm_notifications from anon;
create policy shcm_notifications_select on public.shcm_notifications for select to authenticated
  using (user_id = auth.uid());
create policy shcm_notifications_update on public.shcm_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shcm_notifications_delete on public.shcm_notifications for delete to authenticated
  using (user_id = auth.uid());
