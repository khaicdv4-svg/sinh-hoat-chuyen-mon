# Sinh hoạt chuyên môn — Tổ 4

Next.js 15 + Supabase. Cơ sở dữ liệu đã dựng sẵn trên dự án `hoc-ma-vui-dev` (bảng tiền tố `shcm_`).
File tạo bảng: `supabase/migrations/001_shcm_init.sql` (đã chạy, không chạy lại).

## Đưa lên Vercel
1. Đưa thư mục này lên một kho GitHub riêng, rồi Vercel → Add New Project → chọn kho đó (framework Next.js, giữ mặc định).
2. Environment Variables (xem `.env.example`):
   - NEXT_PUBLIC_SUPABASE_URL = https://hirullckrmbkhmlchsdd.supabase.co
   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = sb_publishable_qhky--zyK4iFaNgzl2BPhg_KHkGGD5v
   - ANTHROPIC_API_KEY = khóa của thầy (tự nhập trong Vercel)
   - các biến còn lại trong `.env.example` (tên trường, tổ, năm học, hạn mức AI)
3. Supabase → Authentication → Providers → Google: bật, nhập Client ID/Secret từ Google Cloud.
   Supabase → Authentication → URL Configuration: Site URL = địa chỉ Vercel; thêm `https://<địa chỉ>/auth/callback` vào Redirect URLs.
4. Đăng nhập lần đầu bằng khaicdv4@gmail.com: tự thành tổ trưởng + quản trị. Các tài khoản khác chờ duyệt ở trang Thành viên.

## Cập nhật theo mẫu biên bản của trường (migration 002, đã chạy)
- Danh sách thành viên tổ (trang Thành viên), điểm danh, chủ trì, thư ký; thư ký ghi ý kiến thay thành viên.
- Biên bản theo khung A. Thành phần – B. Nội dung (I–IV) – C. Biểu quyết và kết luận; xuất Word đúng bố cục mẫu.
- Nhập nội dung từ biên bản Word/PDF đã soạn: AI chia vào các mục, gắn đúng người nói, ở dạng đề xuất chờ tổ trưởng nhận.

## Lịch sinh hoạt, thông báo, biểu mẫu (migration 007, đã chạy)
- Trang Lịch sinh hoạt: tổ trưởng chọn hình thức họp (trực tiếp / trực tuyến, kèm nền tảng và đường dẫn), bấm "Lưu và gửi thông báo".
- Thông báo trong ứng dụng (chuông ở menu, bảng `shcm_notifications`). Cần `SUPABASE_SERVICE_ROLE_KEY` trên máy chủ để tạo thông báo.
- Gửi thêm thư điện tử là tùy chọn: đặt `RESEND_API_KEY` và `MAIL_FROM` trên Vercel. Không đặt thì chỉ có thông báo trong ứng dụng.
- Tư liệu › Mẫu biểu: tệp tải lên được AI đọc mỗi lần soạn biên bản (học bố cục, giọng văn, không chép nội dung cũ).
