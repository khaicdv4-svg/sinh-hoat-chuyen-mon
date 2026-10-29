/**
 * Gửi thư báo qua Resend, chỉ chạy khi máy chủ có RESEND_API_KEY.
 * Không có khóa thì bỏ qua, thông báo trong ứng dụng vẫn được tạo.
 * MAIL_FROM ví dụ: "Tổ chuyên môn 4 <thongbao@ten-mien-cua-thay.vn>"
 */
export function mailEnabled() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "Tổ chuyên môn <onboarding@resend.dev>", to: [to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
