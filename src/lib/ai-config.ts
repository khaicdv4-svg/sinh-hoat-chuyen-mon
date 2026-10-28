import { adminDb } from "@/lib/admin-db";

/** Một model trong danh sách của tổ. Dùng chung một khóa API. */
export type AiModelEntry = {
  id: string; // mã nội bộ (m1, m2…)
  label: string; // tên hiển thị
  model: string; // ID model gửi cho cổng, ví dụ pro/claude-opus-5-5-medium
  kind: "anthropic" | "openai"; // chuẩn kết nối
  baseUrl: string; // để trống nếu dùng API Anthropic trực tiếp
};

export type AiSettings = {
  apiKey: string;
  models: AiModelEntry[];
  defaultId: string;
  routes: { nhe?: string; tep?: string }; // nhe: ý kiến, gom ý kiến; tep: đọc tệp (nhập biên bản, kế hoạch, văn bản, mẫu)
};

/** Cấu hình một lần gọi AI. */
export type AiConfig = { apiKey: string; baseUrl: string; model: string; provider: "anthropic" | "openai" };

export const AI_SETTING_KEYS = ["ai_api_key", "ai_models", "ai_default", "ai_route_nhe", "ai_route_tep", "ai_base_url", "ai_model", "ai_provider"] as const;

const FILE_FEATURES = new Set(["nhap_bien_ban", "chia_ke_hoach", "van_ban_moi", "mau_bien_ban"]);
export const featureGroup = (feature: string): "nhe" | "tep" => (FILE_FEATURES.has(feature) ? "tep" : "nhe");

export function parseModels(raw: string | undefined): AiModelEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.model === "string" && m.model.trim())
      .map((m, i) => ({
        id: String(m.id || `m${i + 1}`),
        label: String(m.label || m.model),
        model: String(m.model).trim(),
        kind: m.kind === "openai" ? "openai" : "anthropic",
        baseUrl: String(m.baseUrl || "").trim().replace(/\/+$/, ""),
      }));
  } catch {
    return [];
  }
}

/** Gộp giá trị đã lưu trong app với biến môi trường (dự phòng cho bản cũ). */
export function buildSettings(saved: Record<string, string>): AiSettings {
  let models = parseModels(saved.ai_models);
  if (!models.length) {
    const provider = (saved.ai_provider || process.env.AI_PROVIDER || "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic";
    const model = saved.ai_model || process.env.AI_MODEL || "claude-sonnet-5-5";
    models = [{ id: "m1", label: model, model, kind: provider, baseUrl: (saved.ai_base_url || process.env.AI_BASE_URL || "").replace(/\/+$/, "") }];
  }
  const defaultId = models.some((m) => m.id === saved.ai_default) ? saved.ai_default : models[0].id;
  return {
    apiKey: saved.ai_api_key || process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
    models,
    defaultId,
    routes: { nhe: saved.ai_route_nhe || undefined, tep: saved.ai_route_tep || undefined },
  };
}

export async function loadAiSettings(): Promise<AiSettings> {
  const saved: Record<string, string> = {};
  const db = adminDb();
  if (db) {
    const { data } = await db.from("shcm_settings").select("key, value").in("key", [...AI_SETTING_KEYS]);
    for (const r of data ?? []) saved[r.key] = r.value;
  }
  return buildSettings(saved);
}

export function entryConfig(s: AiSettings, e: AiModelEntry): AiConfig {
  return { apiKey: s.apiKey, baseUrl: e.baseUrl, model: e.model, provider: e.kind };
}

/** Chọn model cho từng việc: theo nhóm việc nếu có đặt, không thì dùng model mặc định. */
export function pickConfig(s: AiSettings, feature: string): AiConfig {
  const want = s.routes[featureGroup(feature)] || s.defaultId;
  const entry = s.models.find((m) => m.id === want) ?? s.models.find((m) => m.id === s.defaultId) ?? s.models[0];
  return entryConfig(s, entry);
}
