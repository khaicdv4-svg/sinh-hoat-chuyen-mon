-- Ý kiến của giáo viên và cấu trúc biên bản theo mẫu mới (Tuần 7+8, Tuần 9+10)
-- Mỗi mục có phần nội dung (tổ trưởng ghi) và phần ý kiến (giáo viên gửi, tổ trưởng quyết định).

------------------------------------------------------------------
-- 1. Cột mới
------------------------------------------------------------------
alter table public.shcm_entries
  add column kind text not null default 'noi_dung' check (kind in ('noi_dung', 'y_kien'));
alter table public.shcm_entries drop constraint shcm_entries_status_check;
alter table public.shcm_entries add constraint shcm_entries_status_check
  check (status in ('proposed', 'accepted', 'pending', 'merged', 'dismissed'));
-- pending: giáo viên vừa gửi, chờ tổ trưởng; accepted: ghi nhận; merged: bổ sung vào nội dung; dismissed: xem xét lại, không vào biên bản
create index shcm_entries_kind_status_idx on public.shcm_entries (section_id, kind, status);

alter table public.shcm_sections
  add column allow_opinions boolean not null default true,
  add column opinion_label text,
  add column numbered boolean not null default true;

create function public.shcm_section_opinions(p_section uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.allow_opinions from public.shcm_sections s where s.id = p_section), false)
$$;

------------------------------------------------------------------
-- 2. Quyền đọc, ghi ý kiến
------------------------------------------------------------------
drop policy shcm_entries_select on public.shcm_entries;
create policy shcm_entries_select on public.shcm_entries for select to authenticated
  using (
    public.shcm_is_approved()
    and (
      status in ('accepted', 'merged')
      or public.shcm_is_leader()
      or (status in ('pending', 'dismissed')
          and (author_id = (select auth.uid()) or public.shcm_is_section_secretary(section_id)))
    )
  );

drop policy shcm_entries_insert on public.shcm_entries;
create policy shcm_entries_insert on public.shcm_entries for insert to authenticated
  with check (
    public.shcm_is_leader()
    or (
      author_id = (select auth.uid())
      and public.shcm_can_write()
      and source in ('manual', 'ai_assisted')
      and (
        -- Ý kiến: mọi thành viên gửi được (chờ tổ trưởng); thư ký ghi thay người khác thì vào thẳng biên bản
        (kind = 'y_kien'
         and public.shcm_section_opinions(section_id)
         and ((status = 'pending' and (speaker_id is null or speaker_id = public.shcm_my_member_id()))
              or (status = 'accepted' and public.shcm_is_section_secretary(section_id))))
        -- Nội dung: theo quyền ghi của mục như trước
        or (kind = 'noi_dung'
            and status = 'accepted'
            and public.shcm_section_allows(section_id, 'entry')
            and (speaker_id is null
                 or speaker_id = public.shcm_my_member_id()
                 or public.shcm_is_section_secretary(section_id)))
      )
    )
  );

drop policy shcm_entries_update on public.shcm_entries;
create policy shcm_entries_update on public.shcm_entries for update to authenticated
  using (
    public.shcm_is_leader()
    or (author_id = (select auth.uid()) and public.shcm_can_write()
        and ((kind = 'y_kien' and status = 'pending') or (kind = 'noi_dung' and status = 'accepted')))
    or (kind = 'y_kien' and status = 'accepted' and public.shcm_is_section_secretary(section_id))
  )
  with check (
    public.shcm_is_leader()
    or (author_id = (select auth.uid()) and public.shcm_can_write()
        and ((kind = 'y_kien' and status = 'pending'
              and (speaker_id is null or speaker_id = public.shcm_my_member_id()))
             or (kind = 'noi_dung' and status = 'accepted'
                 and (speaker_id is null
                      or speaker_id = public.shcm_my_member_id()
                      or public.shcm_is_section_secretary(section_id)))))
    or (kind = 'y_kien' and status = 'accepted' and public.shcm_is_section_secretary(section_id))
  );

drop policy shcm_entries_delete on public.shcm_entries;
create policy shcm_entries_delete on public.shcm_entries for delete to authenticated
  using (
    public.shcm_is_leader()
    or (author_id = (select auth.uid()) and public.shcm_can_write()
        and (status in ('pending', 'dismissed') or kind = 'noi_dung'))
    or (kind = 'y_kien' and status = 'accepted' and public.shcm_is_section_secretary(section_id))
  );

------------------------------------------------------------------
-- 3. Mẫu đề mục theo biên bản mới
------------------------------------------------------------------
update public.shcm_templates set sections = $json$[
 {
  "key": "danh_gia_cm",
  "part": "I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}",
  "title": "Công tác chuyên môn",
  "hint": "Việc thực hiện chương trình, kế hoạch bài dạy, hỗ trợ học sinh trong hai tuần qua. Tổ trưởng ghi nội dung; giáo viên bổ sung ý kiến bên dưới.",
  "layout": "inline",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "gom_y_kien",
  "position": 10,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "danh_gia_cn",
  "part": "I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}",
  "title": "Công tác chủ nhiệm",
  "hint": "Nền nếp, vệ sinh, an toàn, phối hợp cha mẹ học sinh, cập nhật EnetViet, LMS và hồ sơ.",
  "layout": "inline",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "gom_y_kien",
  "position": 20,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "danh_gia_nv",
  "part": "I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}",
  "title": "Nhiệm vụ chuyên môn đã giao",
  "hint": "Tình hình hoàn thành nhiệm vụ đã giao ở biên bản trước, nội dung cần điều chỉnh, người phụ trách.",
  "layout": "inline",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "gom_y_kien",
  "position": 30,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "chuyen_tiep",
  "part": "I. ĐÁNH GIÁ VIỆC THỰC HIỆN NHIỆM VỤ {truoc}",
  "title": "Việc chuyển tiếp từ nghiên cứu bài học",
  "hint": "Kết quả vận dụng của chu trình trước, tiến độ chuẩn bị bài nghiên cứu tiếp theo. Kết quả và minh chứng được xác nhận tại cuộc họp.",
  "layout": "inline",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "tong_hop_ket_qua",
  "position": 40,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Báo cáo của giáo viên"
 },
 {
  "key": "chuong_trinh",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Thực hiện chương trình và hỗ trợ học sinh",
  "hint": "Thực hiện chương trình, kế hoạch bài dạy, nội dung tích hợp, học sinh cần hỗ trợ trong hai tuần này.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 100,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "nhiem_vu",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Thực hiện nhiệm vụ của tuần",
  "hint": "Nhiệm vụ trọng tâm trong hai tuần theo lịch công tác: kiểm tra, kế hoạch, hồ sơ, hoạt động. Mỗi ý một dòng.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 105,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "van_ban",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Triển khai văn bản mới",
  "hint": "Văn bản mới và nội dung vận dụng tại tổ.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "evidence",
  "ai_action": "none",
  "position": 300,
  "allow_opinions": true,
  "numbered": true,
  "file_label": "Văn bản",
  "opinion_label": "Ý kiến trao đổi"
 },
 {
  "key": "cd_noi_dung",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Sinh hoạt chuyên đề",
  "hint": "Tên chuyên đề, trọng tâm của tổ, mục tiêu và sản phẩm. Người được phân công tải tài liệu.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "assigned",
  "files_mode": "viewer",
  "ai_action": "gom_y_kien",
  "position": 310,
  "allow_opinions": true,
  "numbered": true,
  "file_label": "Tài liệu chuyên đề",
  "opinion_label": "Ý kiến trao đổi về chuyên đề"
 },
 {
  "key": "cd_thuc_hanh",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Các bước thực hành của chuyên đề",
  "hint": "Các bước thực hành từ xác định nhu cầu đến rút kinh nghiệm; mỗi bước một đoạn.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 320,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "cd_phan_cong",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Phân công và theo dõi thuộc chuyên đề",
  "hint": "Ai hỗ trợ, ai hoàn thiện sản phẩm, thời điểm áp dụng, cách theo dõi.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 330,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "chia_se",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Chia sẻ kinh nghiệm, học liệu và sản phẩm chuyên môn",
  "hint": "Ghi theo cấu trúc: người chia sẻ – tên học liệu hoặc kinh nghiệm – bài, lớp áp dụng – nơi lưu hoặc đường dẫn – lưu ý khi dùng. Chỉ ghi sản phẩm đã giới thiệu tại cuộc họp.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "all",
  "files_mode": "evidence",
  "ai_action": "none",
  "position": 360,
  "allow_opinions": true,
  "numbered": true,
  "file_label": "Học liệu, sản phẩm",
  "opinion_label": "Chia sẻ của giáo viên"
 },
 {
  "key": "phan_cong",
  "part": "IV. PHÂN CÔNG VÀ THEO DÕI SAU SINH HOẠT",
  "title": "Phân công và theo dõi",
  "hint": "Mỗi việc một dòng: người phụ trách, việc cần làm, thời hạn.",
  "layout": "list",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 400,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến, đề xuất bổ sung"
 },
 {
  "key": "ket_luan",
  "part": "C. BIỂU QUYẾT VÀ KẾT LUẬN",
  "title": "Nội dung thống nhất",
  "hint": "Kết luận của chủ trì. Số biểu quyết và giờ kết thúc ghi ở phần thông tin buổi họp.",
  "layout": "inline",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "du_thao_ket_luan",
  "position": 900,
  "allow_opinions": false,
  "numbered": true
 }
]$json$::jsonb,
  name = 'Khung biên bản sinh hoạt tổ', description = 'Các phần I, II, III, IV và C của biên bản sinh hoạt tổ' where key = 'khung_sh';
update public.shcm_templates set sections = $json$[
 {
  "key": "ncbh_thong_tin",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Nghiên cứu bài học",
  "hint": "Đổi tên thành “Nghiên cứu bài học môn …”. Ghi bài nghiên cứu, giáo viên dạy minh họa, căn cứ kế hoạch SHCM-NCBH. Giai đoạn đang thực hiện chọn ở thông tin buổi họp.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 110,
  "allow_opinions": false,
  "numbered": true
 },
 {
  "key": "ncbh_b1",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Bước 1 – Xây dựng bài học minh họa",
  "hint": "Trọng tâm góp ý, sản phẩm dự kiến, điểm cần rà soát trước khi dạy. Người được phân công tải kế hoạch bài dạy.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "assigned",
  "files_mode": "viewer",
  "ai_action": "tom_tat_gop_y",
  "position": 120,
  "allow_opinions": true,
  "numbered": false,
  "file_label": "Kế hoạch bài dạy",
  "opinion_label": "Ý kiến góp ý Bước 1"
 },
 {
  "key": "ncbh_b1_chot",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Tổ trưởng chốt phần chuẩn bị",
  "hint": "Việc giáo viên dạy hoàn thiện, việc các thành viên chuẩn bị để dự giờ. Không xếp loại tiết dạy.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 125,
  "allow_opinions": false,
  "numbered": false
 },
 {
  "key": "ncbh_b2",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Bước 2 – Tổ chức dạy minh họa và dự giờ",
  "hint": "Thời gian, lớp dạy, nội dung quan sát. Thu thập minh chứng làm căn cứ phân tích. Không xếp loại tiết dạy.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "all",
  "files_mode": "evidence",
  "ai_action": "none",
  "position": 130,
  "allow_opinions": true,
  "numbered": false,
  "file_label": "Minh chứng tiết dạy",
  "opinion_label": "Ghi nhận khi dự giờ"
 },
 {
  "key": "ncbh_tiep",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Phân công nghiên cứu bài học tiếp theo",
  "hint": "Môn, bài, giáo viên thực hiện, thời gian từng bước ở các buổi sau.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 140,
  "allow_opinions": true,
  "numbered": false,
  "opinion_label": "Ý kiến bổ sung"
 }
]$json$::jsonb,
  description = 'Dùng cho buổi xây dựng bài học minh họa và dự giờ' where key = 'ncbh_12';
update public.shcm_templates set sections = $json$[
 {
  "key": "ncbh_thong_tin",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Nghiên cứu bài học",
  "hint": "Đổi tên thành “Nghiên cứu bài học môn …”. Ghi bài nghiên cứu, giáo viên dạy minh họa, căn cứ kế hoạch SHCM-NCBH. Giai đoạn đang thực hiện chọn ở thông tin buổi họp.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 110,
  "allow_opinions": false,
  "numbered": true
 },
 {
  "key": "ncbh_b3",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Bước 3 – Phân tích bài học từ minh chứng",
  "hint": "Ghi nhận cụ thể, nguyên nhân khó khăn, giải pháp điều chỉnh tổ thống nhất. Tải minh chứng: bài làm, ảnh, ghi chép dự giờ.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "all",
  "files_mode": "evidence",
  "ai_action": "gom_y_kien",
  "position": 120,
  "allow_opinions": true,
  "numbered": false,
  "file_label": "Minh chứng phân tích",
  "opinion_label": "Ý kiến trao đổi trong Bước 3"
 },
 {
  "key": "ncbh_b3_chot",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Tổ trưởng chốt Bước 3",
  "hint": "Điều tổ rút ra từ minh chứng và các điều chỉnh thống nhất. Không xếp loại tiết dạy minh họa.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 125,
  "allow_opinions": false,
  "numbered": false
 },
 {
  "key": "ncbh_b4",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Bước 4 – Báo cáo kết quả vận dụng vào dạy học hằng ngày",
  "hint": "Mỗi giáo viên báo cáo việc vận dụng ở lớp mình: đã làm gì, học sinh thay đổi thế nào, điều tiếp tục làm.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "all",
  "files_mode": "evidence",
  "ai_action": "tong_hop_ket_qua",
  "position": 130,
  "allow_opinions": true,
  "numbered": false,
  "file_label": "Minh chứng vận dụng",
  "opinion_label": "Báo cáo vận dụng của giáo viên"
 },
 {
  "key": "ncbh_b4_chot",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Kết luận Bước 4 của tổ trưởng",
  "hint": "Giải pháp dùng chung của tổ, việc cần theo dõi. Kết quả chỉ chốt khi đã đối chiếu với thực tế lớp.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 135,
  "allow_opinions": false,
  "numbered": false
 },
 {
  "key": "ncbh_theo_doi",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Theo dõi tiếp nối thuộc nghiên cứu bài học",
  "hint": "Ai hoàn thiện nội dung vận dụng, ai đối chiếu kết quả; việc chưa đủ minh chứng ghi rõ để theo dõi tiếp.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 138,
  "allow_opinions": false,
  "numbered": false
 },
 {
  "key": "ncbh_tiep",
  "part": "II. SINH HOẠT CHUYÊN MÔN {tuan}",
  "title": "Phân công nghiên cứu bài học tiếp theo",
  "hint": "Môn, bài, giáo viên thực hiện, thời gian từng bước ở các buổi sau.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 140,
  "allow_opinions": true,
  "numbered": false,
  "opinion_label": "Ý kiến bổ sung"
 }
]$json$::jsonb,
  description = 'Dùng cho buổi phân tích bài học từ minh chứng và báo cáo vận dụng' where key = 'ncbh_34';
update public.shcm_templates set sections = $json$[
 {
  "key": "cd_noi_dung",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Sinh hoạt chuyên đề",
  "hint": "Tên chuyên đề, trọng tâm của tổ, mục tiêu và sản phẩm. Người được phân công tải tài liệu.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "assigned",
  "files_mode": "viewer",
  "ai_action": "gom_y_kien",
  "position": 310,
  "allow_opinions": true,
  "numbered": true,
  "file_label": "Tài liệu chuyên đề",
  "opinion_label": "Ý kiến trao đổi về chuyên đề"
 },
 {
  "key": "cd_thuc_hanh",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Các bước thực hành của chuyên đề",
  "hint": "Các bước thực hành từ xác định nhu cầu đến rút kinh nghiệm; mỗi bước một đoạn.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 320,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 },
 {
  "key": "cd_phan_cong",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Phân công và theo dõi thuộc chuyên đề",
  "hint": "Ai hỗ trợ, ai hoàn thiện sản phẩm, thời điểm áp dụng, cách theo dõi.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "none",
  "position": 330,
  "allow_opinions": true,
  "numbered": true,
  "opinion_label": "Ý kiến bổ sung"
 }
]$json$::jsonb where key = 'chuyen_de';
update public.shcm_templates set sections = $json$[
 {
  "key": "tai_lieu",
  "part": "III. SINH HOẠT VĂN BẢN, SINH HOẠT CHUYÊN ĐỀ, GIỚI THIỆU TÀI LIỆU GIÁO DỤC",
  "title": "Giới thiệu tài liệu, học liệu giáo dục",
  "hint": "Tên tài liệu, người giới thiệu, nội dung có thể dùng ở lớp.",
  "layout": "block",
  "entry_editors": "leader",
  "file_editors": "all",
  "files_mode": "evidence",
  "ai_action": "none",
  "position": 365,
  "allow_opinions": true,
  "numbered": true,
  "file_label": "Tài liệu",
  "opinion_label": "Ý kiến bổ sung"
 }
]$json$::jsonb where key = 'tai_lieu';
update public.shcm_templates set sections = $json$[
 {
  "key": "ket_luan",
  "part": "C. BIỂU QUYẾT VÀ KẾT LUẬN",
  "title": "Nội dung thống nhất",
  "hint": "Kết luận của chủ trì.",
  "layout": "inline",
  "entry_editors": "leader",
  "file_editors": "leader",
  "files_mode": "none",
  "ai_action": "du_thao_ket_luan",
  "position": 900,
  "allow_opinions": false,
  "numbered": true
 }
]$json$::jsonb where key = 'ket_luan';

------------------------------------------------------------------
-- 4. Dựng lại đề mục cho 17 biên bản (chưa có nội dung): khung mới + NCBH theo chu kỳ 4 tuần
--    Tuần 1-2, 5-6, 9-10…: Bước 1-2; Tuần 3-4, 7-8, 11-12…: Bước 3-4
------------------------------------------------------------------
delete from public.shcm_sections s
using public.shcm_meetings m
where s.meeting_id = m.id and m.kind = 'sinh_hoat' and m.status = 'open'
  and not exists (select 1 from public.shcm_entries e where e.section_id = s.id)
  and not exists (select 1 from public.shcm_files f where f.section_id = s.id);

insert into public.shcm_sections
  (meeting_id, key, title, hint, position, entry_editors, file_editors, files_mode, file_label, ai_action,
   part, layout, allow_opinions, opinion_label, numbered)
select m.id,
       e.elem ->> 'key', e.elem ->> 'title', e.elem ->> 'hint', (e.elem ->> 'position')::int,
       e.elem ->> 'entry_editors', e.elem ->> 'file_editors', e.elem ->> 'files_mode',
       e.elem ->> 'file_label', coalesce(e.elem ->> 'ai_action', 'none'),
       e.elem ->> 'part', coalesce(e.elem ->> 'layout', 'block'),
       coalesce((e.elem ->> 'allow_opinions')::boolean, true), e.elem ->> 'opinion_label',
       coalesce((e.elem ->> 'numbered')::boolean, true)
from public.shcm_meetings m
cross join lateral (
  select jsonb_array_elements(t.sections) as elem
  from public.shcm_templates t
  where t.key = 'khung_sh'
     or t.key = case when ((m.week_from - 1) / 2) % 2 = 0 then 'ncbh_12' else 'ncbh_34' end
) e
where m.kind = 'sinh_hoat' and m.status = 'open' and m.week_from is not null
on conflict (meeting_id, key) do nothing;

update public.shcm_meetings
   set ncbh_stage = case when ((week_from - 1) / 2) % 2 = 0
         then 'Bước 1 – Xây dựng bài học minh họa; Bước 2 – Tổ chức dạy minh họa và dự giờ'
         else 'Bước 3 – Phân tích bài học; Bước 4 – Báo cáo kết quả vận dụng' end
 where kind = 'sinh_hoat' and week_from is not null and (ncbh_stage is null or ncbh_stage = '');
