import { requireLeader } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";
import { AI_SETTING_KEYS } from "@/lib/ai-config";
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
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold">Cài đặt AI</h1>
      <p className="mb-5 mt-1 text-sm text-gray-600">Chỉ tổ trưởng thấy trang này. Khóa lưu trên máy chủ, không hiện lại trên màn hình.</p>
      <AiSettingsForm
        keyTail={saved.ai_api_key ? saved.ai_api_key.slice(-4) : ""}
        baseUrl={saved.ai_base_url ?? ""}
        model={saved.ai_model ?? ""}
        provider={saved.ai_provider ?? "anthropic"}
        hasDb={!!db}
        hasEnvKey={!!(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}
