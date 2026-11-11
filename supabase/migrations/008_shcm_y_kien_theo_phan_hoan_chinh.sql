-- Mục C đổi thành mục V; ý kiến gom cuối mỗi mục lớn (xử lý ở giao diện);
-- nút "Hoàn chỉnh biên bản": AI rà soát, thay nội dung bằng bản hoàn chỉnh, giữ bản cũ để hoàn tác.

-- 1. Đổi tên phần C thành V (biên bản đang mở và các mẫu)
update public.shcm_sections s
   set part = 'V. BIỂU QUYẾT VÀ KẾT LUẬN'
  from public.shcm_meetings m
 where s.meeting_id = m.id and m.status = 'open' and s.part = 'C. BIỂU QUYẾT VÀ KẾT LUẬN';

update public.shcm_templates
   set sections = replace(sections::text, 'C. BIỂU QUYẾT VÀ KẾT LUẬN', 'V. BIỂU QUYẾT VÀ KẾT LUẬN')::jsonb
 where sections::text like '%C. BIỂU QUYẾT VÀ KẾT LUẬN%';

-- 2. Nguồn mới cho nội dung do AI hoàn chỉnh
alter table public.shcm_entries drop constraint shcm_entries_source_check;
alter table public.shcm_entries add constraint shcm_entries_source_check
  check (source in ('manual', 'ai_assisted', 'ke_hoach', 'van_ban_moi', 'ai_summary', 'nhap_file', 'hoan_chinh'));

-- 3. Thời điểm biên bản được hoàn chỉnh (bản xuất bỏ các chỗ chấm trống)
alter table public.shcm_meetings add column if not exists finalized_at timestamptz;
