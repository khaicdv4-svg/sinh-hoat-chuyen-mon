"use client";
import { useActionState } from "react";
import { saveAiSettings, testAi, type AiFormState } from "@/app/cai-dat-ai/actions";

const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"];

export default function AiSettingsForm({
  keyTail, baseUrl, model, provider, hasDb, hasEnvKey,
}: {
  keyTail: string; baseUrl: string; model: string; provider: string; hasDb: boolean; hasEnvKey: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState<AiFormState, FormData>(saveAiSettings, null);
  const [testState, testAction, testing] = useActionState<AiFormState, FormData>(async () => testAi(), null);

  return (
    <div className="grid gap-6">
      {!hasDb && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Máy chủ chưa có SUPABASE_SERVICE_ROLE_KEY. Cần thêm biến này trên Vercel một lần, rồi Redeploy, mới lưu được key trong app.
        </p>
      )}

      <form action={saveAction} className="grid gap-4 rounded-lg border border-[var(--line)] bg-white p-5">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Khóa API (API key)</span>
          <input name="apiKey" type="password" autoComplete="off" placeholder={keyTail ? `Đã lưu: ••••${keyTail}. Để trống nếu giữ nguyên` : "Dán khóa API vào đây"} className="rounded border border-gray-300 px-3 py-2" />
          <span className="text-xs text-gray-500">
            {keyTail ? `Khóa đang dùng kết thúc bằng ${keyTail}.` : hasEnvKey ? "Đang dùng khóa cài trên Vercel." : "Chưa có khóa."} Khóa không hiện lại trên màn hình sau khi lưu.
          </span>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Địa chỉ cổng (base URL)</span>
          <input name="baseUrl" defaultValue={baseUrl} placeholder="https://apilit.dev" className="rounded border border-gray-300 px-3 py-2" />
          <span className="text-xs text-gray-500">Để trống nếu dùng thẳng API của Anthropic.</span>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Model</span>
          <input name="model" list="ai-models" defaultValue={model || "claude-opus-5-5"} className="rounded border border-gray-300 px-3 py-2" />
          <datalist id="ai-models">
            {MODELS.map((m) => <option key={m} value={m} />)}
          </datalist>
          <span className="text-xs text-gray-500">Chọn gợi ý hoặc gõ đúng tên model mà cổng cho phép.</span>
        </label>

        <fieldset className="grid gap-1 text-sm">
          <span className="font-medium">Kiểu kết nối</span>
          <label className="flex items-center gap-2"><input type="radio" name="provider" value="anthropic" defaultChecked={provider !== "openai"} /> Chuẩn Anthropic (đa số trường hợp, ví dụ apilit.dev)</label>
          <label className="flex items-center gap-2"><input type="radio" name="provider" value="openai" defaultChecked={provider === "openai"} /> Chuẩn OpenAI (/chat/completions)</label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={saving}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</button>
          {saveState && <span className={`text-sm ${saveState.ok ? "text-green-700" : "text-red-700"}`}>{saveState.message}</span>}
        </div>
      </form>

      <form action={testAction} className="grid gap-3 rounded-lg border border-[var(--line)] bg-white p-5">
        <div className="text-sm">
          <div className="font-medium">Kiểm tra kết nối</div>
          <div className="text-xs text-gray-500">Kiểm tra cấu hình đã lưu. Nhớ bấm Lưu trước nếu vừa đổi.</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={testing}>{testing ? "Đang kiểm tra…" : "Kiểm tra"}</button>
          {testState && <span className={`text-sm ${testState.ok ? "text-green-700" : "text-red-700"}`}>{testState.message}</span>}
        </div>
      </form>
    </div>
  );
}
