import type { Profile } from "@/lib/types";
import { ROLE_LABELS, TEAM_NAME } from "@/lib/constants";
import NavMenu from "./NavMenu";

export default function Nav({ profile }: { profile: Profile | null }) {
  if (!profile) return null;
  const approved = profile.status === "approved";
  return (
    <NavMenu
      user={{
        approved,
        leader: approved && profile.role === "to_truong",
        admin: approved && !!profile.is_admin,
        name: profile.full_name || profile.email,
        roleLabel: ROLE_LABELS[profile.role],
        team: TEAM_NAME,
      }}
    />
  );
}
