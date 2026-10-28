import { redirect } from "next/navigation";
import { getMyMember, getProfile } from "@/lib/auth";
import ProfileForm from "@/components/ProfileForm";

export default async function ChoDuyet() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status === "approved") redirect("/");
  const member = await getMyMember(profile.id);
  return (
    <div className="mx-auto mt-12 grid max-w-md gap-4">
    <div className="card p-6">
      <h1 className="text-lg font-semibold">
        {profile.status === "rejected" ? "Tài khoản chưa được chấp nhận" : "Tài khoản đang chờ duyệt"}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        {profile.status === "rejected"
          ? "Tổ trưởng chưa chấp nhận tài khoản này. Bạn liên hệ trực tiếp tổ trưởng nếu cần."
          : `Bạn đã đăng nhập bằng ${profile.email}. Tổ trưởng duyệt xong, bạn tải lại trang này là vào được.`}
      </p>
    </div>
    {profile.status === "pending" && (
      <div className="card p-6">
        <h2 className="mb-3 font-semibold">Khai họ tên và nhiệm vụ</h2>
        <ProfileForm email={profile.email} member={member} first={!member} next="/cho-duyet" />
      </div>
    )}
    </div>
  );
}
