import { adminDb } from "@/lib/admin-db";

export type AiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "anthropic" | "openai";
};

export const AI_SETTING_KEYS = ["ai_api_key", "ai_base_url", "ai_model", "ai_provider"] as const;

/** Đọc cấu hình AI: ưu tiên giá trị đã lưu trong ứng dụng, thiếu thì lấy biến môi trường. */
export async function loadAiConfig(): Promise<AiConfig> {
  const saved: Record<string, string> = {};
  const db = adminDb();
  if (db) {
    const { data } = await db.from("shcm_settings").select("key, value").in("key", [...AI_SETTING_KEYS]);
    for (const r of data ?? []) saved[r.key] = r.value;
  }
  const provider = (saved.ai_provider || process.env.AI_PROVIDER || "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic";
  return {
    apiKey: saved.ai_api_key || process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
    baseUrl: (saved.ai_base_url || process.env.AI_BASE_URL || "").replace(/\/+$/, ""),
    model: saved.ai_model || process.env.AI_MODEL || "claude-sonnet-5-5",
    provider,
  };
}
