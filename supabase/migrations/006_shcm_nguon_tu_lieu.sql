-- Nguồn tư liệu cho AI: kế hoạch, văn bản/công văn, lịch và Drive. Chỉ tổ trưởng quản lý.
create table public.shcm_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ke_hoach', 'van_ban', 'lich')),
  title text not null check (char_length(title) between 1 and 200),
  url text,
  note text,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  text_content text,
  enabled boolean not null default true,
  created_by uuid references public.shcm_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index shcm_sources_kind_idx on public.shcm_sources (kind, created_at desc);
alter table public.shcm_sources enable row level security;
revoke all on public.shcm_sources from anon;
create policy shcm_sources_all on public.shcm_sources for all to authenticated
  using (public.shcm_is_leader()) with check (public.shcm_is_leader());
