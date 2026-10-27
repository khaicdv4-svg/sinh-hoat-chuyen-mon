"use server";
import { revalidatePath } from "next/cache";
import { requireLeader } from "@/lib/auth";
import { adminDb } from "@/lib/admin-db";
import { loadAiConfig } from "@/lib/ai-config";
import { testAiConnection } from "@/lib/ai";

export type AiFormState = { ok: boolean; message: string } | null;

export async function saveAiSettings(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  await requireLeader();
  const db = adminDb();
  if (!db) return { ok: false, message: "Máy chủ chưa có SUPABASE_SERVICE_ROLE_KEY. Cần thêm biến này trên Vercel một lần." };

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");
  const model = String(formData.get("model") ?? "").trim();
  const provider = formData.get("provider") === "openai" ? "openai" : "anthropic";

  if (baseUrl && !/^https:\/\//.test(baseUrl)) return { ok: false, message: "Địa chỉ cổng phải bắt đầu bằng https://" };
  if (!model) return { ok: false, message: "Chưa nhập tên model." };
  if (provider === "openai" && !baseUrl) return { ok: false, message: "Kiểu OpenAI cần có địa chỉ cổng." };

  const rows = [
    { key: "ai_base_url", value: baseUrl },
    { key: "ai_model", value: model },
    { key: "ai_provider", value: provider },
    ...(apiKey ? [{ key: "ai_api_key", value: apiKey }] : []),
  ];
  const { error } = await db.from("shcm_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: "Chưa lưu được: " + error.message };

  revalidatePath("/cai-dat-ai");
  return { ok: true, message: apiKey ? "Đã lưu khóa và cấu hình mới." : "Đã lưu cấu hình (giữ khóa cũ)." };
}

export async function testAi(): Promise<AiFormState> {
  await requireLeader();
  const cfg = await loadAiConfig();
  if (!cfg.apiKey) return { ok: false, message: "Chưa có khóa AI. Nhập khóa và bấm Lưu trước." };
  try {
    const reply = await testAiConnection(cfg);
    return { ok: true, message: `Kết nối được. Model trả lời: "${reply.slice(0, 60)}"` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: "Chưa kết nối được: " + msg.slice(0, 250) };
  }
}
