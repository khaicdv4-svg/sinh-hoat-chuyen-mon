-- Bổ sung 4 mục theo công văn SHCM 2026-2027 vào khung và 17 biên bản
update public.shcm_templates set sections = sections || $json$[{"key": "kt_danh_gia", "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}", "title": "Đổi mới kiểm tra đánh giá và hỗ trợ học sinh", "hint": "Công cụ đánh giá, phân tích kết quả học sinh để điều chỉnh dạy học, hỗ trợ học sinh năng khiếu và học sinh còn hạn chế.", "layout": "block", "entry_editors": "leader", "file_editors": "leader", "files_mode": "none", "ai_action": "gom_y_kien", "position": 106, "allow_opinions": true, "numbered": true, "opinion_label": "Ý kiến bổ sung"}, {"key": "hoc_lieu_so", "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC", "title": "Học liệu số, ngân hàng câu hỏi và nội dung buổi thứ hai", "hint": "Học liệu số, ngân hàng câu hỏi, công cụ kiểm tra đánh giá dùng chung; nội dung sinh hoạt buổi thứ hai.", "layout": "block", "entry_editors": "leader", "file_editors": "all", "files_mode": "evidence", "ai_action": "none", "position": 370, "allow_opinions": true, "numbered": true, "opinion_label": "Ý kiến bổ sung", "file_label": "Học liệu, sản phẩm"}, {"key": "cong_nghe_ai", "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC", "title": "Ứng dụng công nghệ số và AI", "hint": "Ứng dụng công nghệ số và AI trong soạn bài, học liệu, kiểm tra đánh giá; lưu ý an toàn thông tin, bảo vệ dữ liệu cá nhân, dùng AI có trách nhiệm.", "layout": "block", "entry_editors": "leader", "file_editors": "leader", "files_mode": "none", "ai_action": "gom_y_kien", "position": 380, "allow_opinions": true, "numbered": true, "opinion_label": "Ý kiến bổ sung"}, {"key": "sinh_hoat_cum", "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC", "title": "Sinh hoạt cụm chuyên môn", "hint": "Nội dung chuẩn bị, người tham gia, kết quả và việc vận dụng tại tổ. Mỗi môn sinh hoạt cụm ít nhất 2 lần một năm học.", "layout": "block", "entry_editors": "leader", "file_editors": "leader", "files_mode": "evidence", "ai_action": "none", "position": 390, "allow_opinions": true, "numbered": true, "opinion_label": "Ý kiến bổ sung", "file_label": "Tài liệu cụm"}]$json$::jsonb where key = 'khung_sh'
  and not exists (select 1 from jsonb_array_elements(sections) x where x ->> 'key' = 'kt_danh_gia');

insert into public.shcm_sections
  (meeting_id, key, title, hint, position, entry_editors, file_editors, files_mode, file_label, ai_action,
   part, layout, allow_opinions, opinion_label, numbered)
select m.id, e.elem ->> 'key', e.elem ->> 'title', e.elem ->> 'hint', (e.elem ->> 'position')::int,
       e.elem ->> 'entry_editors', e.elem ->> 'file_editors', e.elem ->> 'files_mode', e.elem ->> 'file_label',
       coalesce(e.elem ->> 'ai_action', 'none'), e.elem ->> 'part', coalesce(e.elem ->> 'layout', 'block'),
       coalesce((e.elem ->> 'allow_opinions')::boolean, true), e.elem ->> 'opinion_label',
       coalesce((e.elem ->> 'numbered')::boolean, true)
from public.shcm_meetings m
cross join lateral (select jsonb_array_elements(t.sections) elem from public.shcm_templates t where t.key = 'khung_sh') e
where m.kind = 'sinh_hoat' and m.week_from is not null
  and e.elem ->> 'key' in ('kt_danh_gia','hoc_lieu_so','cong_nghe_ai','sinh_hoat_cum')
on conflict (meeting_id, key) do nothing;
