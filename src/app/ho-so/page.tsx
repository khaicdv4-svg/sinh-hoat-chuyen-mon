import { redirect } from "next/navigation";
import { getMyMember, getProfile } from "@/lib/auth";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function HoSo() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const member = await getMyMember(profile.id);
  const first = !member;
  return (
    <div className="mx-auto max-w-xl card p-6">
      <h1 className="text-xl font-bold">{first ? "Khai hồ sơ lần đầu" : "Hồ sơ của tôi"}</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        {first ? "Thầy cô điền họ tên và nhiệm vụ một lần. Từ đó mọi ý kiến gửi lên sẽ tự mang tên thầy cô." : "Cập nhật họ tên, nhiệm vụ khi có thay đổi."}
      </p>
      <ProfileForm email={profile.email} member={member} first={first} next={profile.status === "approved" ? "/" : "/cho-duyet"} />
    </div>
  );
}
