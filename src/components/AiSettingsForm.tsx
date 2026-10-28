"use client";
import { useActionState, useState, useTransition } from "react";
import { saveAiSettings, testAi, type AiFormState } from "@/app/cai-dat-ai/actions";
import type { AiModelEntry } from "@/lib/ai-config";
import { PRESETS, type AiPreset } from "@/lib/ai-presets";

const input = "rounded border border-gray-300 px-2 py-1.5 text-sm";

export default function AiSettingsForm({
  keyTail, models: initial, defaultIdx: d0, routeNhe: n0, routeTep: t0, hasDb, hasEnvKey,
}: {
  keyTail: string; models: AiModelEntry[]; defaultIdx: number; routeNhe: number; routeTep: number; hasDb: boolean; hasEnvKey: boolean;
}) {
  const [models, setModels] = useState<AiModelEntry[]>(initial);
  const [defaultIdx, setDefaultIdx] = useState(d0);
  const [routeNhe, setRouteNhe] = useState(n0);
  const [routeTep, setRouteTep] = useState(t0);
  const [saveState, saveAction, saving] = useActionState<AiFormState, FormData>(saveAiSettings, null);
  const [tests, setTests] = useState<Record<string, AiFormState>>({});
  const [testing, startTest] = useTransition();
  const [testingId, setTestingId] = useState("");

  const patch = (i: number, p: Partial<AiModelEntry>) => setModels((a) => a.map((m, k) => (k === i ? { ...m, ...p } : m)));
  const remove = (i: number) => {
    if (models.length <= 1) return;
    setModels((a) => a.filter((_, k) => k !== i));
    const fix = (v: number) => (v === i ? -1 : v > i ? v - 1 : v);
    setDefaultIdx((v) => Math.max(0, fix(v)));
    setRouteNhe(fix);
    setRouteTep(fix);
  };
  const add = (p?: AiPreset) =>
    setModels((a) => [...a, { id: `new${a.length + 1}`, label: p?.label ?? "", model: p?.model ?? "", kind: p?.kind ?? "anthropic", baseUrl: p?.baseUrl ?? "https://apilit.dev" }]);

  const runTest = (m: AiModelEntry) => {
    setTestingId(m.id);
    startTest(async () => {
      const r = await testAi(m.id);
      setTests((t) => ({ ...t, [m.id]: r }));
    });
  };

  return (
    <form action={saveAction} className="grid gap-6">
      {!hasDb && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Máy chủ chưa có SUPABASE_SERVICE_ROLE_KEY. Cần thêm biến này trên Vercel một lần, rồi Redeploy, mới lưu được trong app.
        </p>
      )}

      <section className="grid gap-2 rounded-lg border border-[var(--line)] bg-white p-5">
        <h2 className="font-medium">1. Khóa API (dùng chung cho mọi model)</h2>
        <input name="apiKey" type="password" autoComplete="off" placeholder={keyTail ? `Đã lưu: ••••${keyTail}. Để trống nếu giữ nguyên` : "Dán khóa API vào đây"} className={input} />
        <span className="text-xs text-gray-500">
          {keyTail ? `Khóa đang dùng kết thúc bằng ${keyTail}.` : hasEnvKey ? "Đang dùng khóa cài trên Vercel." : "Chưa có khóa."} Khóa không hiện lại sau khi lưu.
        </span>
      </section>

      <section className="grid gap-3 rounded-lg border border-[var(--line)] bg-white p-5">
        <h2 className="font-medium">2. Danh sách model</h2>
        <p className="text-xs text-gray-500">Chuẩn Anthropic: địa chỉ cổng không có /v1. Chuẩn OpenAI: địa chỉ có /v1. ID model copy từ trang Models của nhà cung cấp.</p>
        <div className="grid gap-3">
          {models.map((m, i) => (
            <div key={i} className="grid gap-2 rounded border border-gray-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={m.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Tên gọi (ví dụ GPT-5.6 Luna)" className={input} />
                <input value={m.model} onChange={(e) => patch(i, { model: e.target.value })} placeholder="ID model (ví dụ pro/gpt-5.6-luna)" className={input} />
                <select value={m.kind} onChange={(e) => patch(i, { kind: e.target.value as "anthropic" | "openai" })} className={input}>
                  <option value="anthropic">Chuẩn Anthropic</option>
                  <option value="openai">Chuẩn OpenAI</option>
                </select>
                <input value={m.baseUrl} onChange={(e) => patch(i, { baseUrl: e.target.value })} placeholder="Địa chỉ cổng (https://…)" className={input} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button type="button" className="btn" disabled={testing || m.id.startsWith("new")} onClick={() => runTest(m)} title={m.id.startsWith("new") ? "Lưu trước rồi kiểm tra" : ""}>
                  {testing && testingId === m.id ? "Đang kiểm tra…" : "Kiểm tra"}
                </button>
                <button type="button" className="btn" disabled={models.length <= 1} onClick={() => remove(i)}>Xóa</button>
                {tests[m.id] && <span className={tests[m.id]!.ok ? "text-green-700" : "text-red-700"}>{tests[m.id]!.message}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn" onClick={() => add()}>+ Thêm model</button>
          <span className="text-gray-500">Thêm nhanh (API-LIT):</span>
          {PRESETS.filter((p) => !models.some((m) => m.model === p.model)).map((p) => (
            <button type="button" key={p.model} className="btn" onClick={() => add(p)}>{p.label}</button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-[var(--line)] bg-white p-5">
        <h2 className="font-medium">3. Dùng model nào cho việc gì</h2>
        <label className="grid gap-1 text-sm">
          <span>Model mặc định (cho gom ý kiến, dự thảo kết luận và mọi việc còn lại)</span>
          <select name="defaultIdx" value={defaultIdx} onChange={(e) => setDefaultIdx(Number(e.target.value))} className={input}>
            {models.map((m, i) => <option key={i} value={i}>{m.label || m.model || `Model ${i + 1}`}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Việc nhẹ: chỉnh ý kiến giáo viên (nút AI hỗ trợ ý kiến). Nên chọn model rẻ</span>
          <select name="routeNhe" value={routeNhe} onChange={(e) => setRouteNhe(Number(e.target.value))} className={input}>
            <option value={-1}>Dùng model mặc định</option>
            {models.map((m, i) => <option key={i} value={i}>{m.label || m.model || `Model ${i + 1}`}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Việc đọc tệp: nhập biên bản từ Word/PDF, chia kế hoạch năm, văn bản mới, tạo mẫu. Nên chọn model mạnh</span>
          <select name="routeTep" value={routeTep} onChange={(e) => setRouteTep(Number(e.target.value))} className={input}>
            <option value={-1}>Dùng model mặc định</option>
            {models.map((m, i) => <option key={i} value={i}>{m.label || m.model || `Model ${i + 1}`}</option>)}
          </select>
        </label>
      </section>

      <input type="hidden" name="models" value={JSON.stringify(models)} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={saving}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</button>
        {saveState && <span className={`text-sm ${saveState.ok ? "text-green-700" : "text-red-700"}`}>{saveState.message}</span>}
      </div>
    </form>
  );
}
