import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

export default async function ChoDuyet() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status === "approved") redirect("/");
  return (
    <div className="mx-auto mt-12 max-w-md card p-6">
      <h1 className="text-lg font-semibold">
        {profile.status === "rejected" ? "Tài khoản chưa được chấp nhận" : "Tài khoản đang chờ duyệt"}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        {profile.status === "rejected"
          ? "Tổ trưởng chưa chấp nhận tài khoản này. Bạn liên hệ trực tiếp tổ trưởng nếu cần."
          : `Bạn đã đăng nhập bằng ${profile.email}. Tổ trưởng duyệt xong, bạn tải lại trang này là vào được.`}
      </p>
    </div>
  );
}
