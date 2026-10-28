"use server";
import { revalidatePath } from "next/cache";
import { requireLeader } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";
import { entryConfig, loadAiSettings, parseModels, type AiModelEntry } from "@/lib/ai-config";
import { testAiConnection } from "@/lib/ai";

export type AiFormState = { ok: boolean; message: string } | null;

export async function saveAiSettings(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  await requireLeader();
  const db = adminDb();
  if (!db) return { ok: false, message: "Máy chủ chưa có SUPABASE_SERVICE_ROLE_KEY. Cần thêm biến này trên Vercel một lần." };

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const models: AiModelEntry[] = parseModels(String(formData.get("models") ?? "[]")).map((m, i) => ({ ...m, id: `m${i + 1}` }));
  if (!models.length) return { ok: false, message: "Cần có ít nhất một model." };
  for (const m of models) {
    if (m.baseUrl && !/^https:\/\//.test(m.baseUrl)) return { ok: false, message: `Địa chỉ cổng của "${m.label}" phải bắt đầu bằng https://` };
    if (m.kind === "openai" && !m.baseUrl) return { ok: false, message: `"${m.label}" dùng chuẩn OpenAI nên cần có địa chỉ cổng.` };
  }
  // Chỉ số đã đổi id (m1, m2…) nên ánh xạ lại theo vị trí người dùng chọn.
  const idx = (name: string) => {
    const n = Number(formData.get(name));
    return Number.isInteger(n) && n >= 0 && n < models.length ? models[n].id : "";
  };

  const rows = [
    { key: "ai_models", value: JSON.stringify(models) },
    { key: "ai_default", value: idx("defaultIdx") || models[0].id },
    { key: "ai_route_nhe", value: idx("routeNhe") },
    { key: "ai_route_tep", value: idx("routeTep") },
    ...(apiKey ? [{ key: "ai_api_key", value: apiKey }] : []),
  ];
  const { error } = await db.from("shcm_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "Chưa lưu được: " + error.message };

  revalidatePath("/cai-dat-ai");
  return { ok: true, message: apiKey ? "Đã lưu khóa và danh sách model." : "Đã lưu danh sách model (giữ khóa cũ)." };
}

/** Kiểm tra một model theo vị trí trong danh sách đã lưu. */
export async function testAi(modelId: string): Promise<AiFormState> {
  await requireLeader();
  const s = await loadAiSettings();
  if (!s.apiKey) return { ok: false, message: "Chưa có khóa AI. Nhập khóa và bấm Lưu trước." };
  const entry = s.models.find((m) => m.id === modelId);
  if (!entry) return { ok: false, message: "Model này chưa được lưu. Bấm Lưu trước rồi kiểm tra." };
  try {
    const reply = await testAiConnection(entryConfig(s, entry));
    return { ok: true, message: `Kết nối được. Model trả lời: "${reply.slice(0, 60)}"` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: "Chưa kết nối được: " + msg.slice(0, 250) };
  }
}
