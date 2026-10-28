import { requireLeader } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";
import { AI_SETTING_KEYS, buildSettings } from "@/lib/ai-config";
import AiSettingsForm from "@/components/AiSettingsForm";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireLeader();
  const db = adminDb();
  const saved: Record<string, string> = {};
  if (db) {
    const { data } = await db.from("shcm_settings").select("key, value").in("key", [...AI_SETTING_KEYS]);
    for (const r of data ?? []) saved[r.key] = r.value;
  }
  const s = buildSettings(saved);
  const idxOf = (id?: string) => Math.max(0, s.models.findIndex((m) => m.id === id));
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Cài đặt AI</h1>
      <p className="mb-5 mt-1 text-sm text-gray-600">Chỉ tổ trưởng thấy trang này. Khóa lưu trên máy chủ, không hiện lại trên màn hình.</p>
      <AiSettingsForm
        key={JSON.stringify([s.models, s.defaultId, s.routes, saved.ai_api_key ? saved.ai_api_key.slice(-4) : ""])}
        keyTail={saved.ai_api_key ? saved.ai_api_key.slice(-4) : ""}
        models={s.models}
        defaultIdx={idxOf(s.defaultId)}
        routeNhe={s.routes.nhe ? idxOf(s.routes.nhe) : -1}
        routeTep={s.routes.tep ? idxOf(s.routes.tep) : -1}
        hasDb={!!db}
        hasEnvKey={!!(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}
