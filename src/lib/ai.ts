import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile } from "@/lib/auth";
import { loadAiConfig, type AiConfig } from "@/lib/ai-config";
import { createClient } from "@/lib/supabase/server";
import { BUCKET, DEFAULT_AI_DAILY_LIMIT_LEADER, DEFAULT_AI_DAILY_LIMIT_TEACHER } from "@/lib/constants";
import { todayVN } from "@/lib/format";
import type { Profile } from "@/lib/types";

function anthropicClient(cfg: AiConfig) {
  return new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) });
}

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface Guard {
  supabase: SupabaseClient;
  profile: Profile;
  cfg: AiConfig;
}

/** Kiểm tra đăng nhập, quyền và hạn mức AI trong ngày. */
export async function aiGuard(opts: { leaderOnly: boolean }): Promise<Guard> {
  const profile = await getProfile();
  if (!profile || profile.status !== "approved") throw new AiError("Bạn chưa đăng nhập hoặc chưa được duyệt.", 401);
  if (profile.role !== "giao_vien" && profile.role !== "to_truong") throw new AiError("Tài khoản của bạn không dùng được AI.", 403);
  if (opts.leaderOnly && profile.role !== "to_truong") throw new AiError("Chức năng này chỉ dành cho tổ trưởng.", 403);
  const cfg = await loadAiConfig();
  if (!cfg.apiKey) throw new AiError("Chưa có khóa AI. Tổ trưởng vào mục Cài đặt AI để nhập khóa.", 503);
  if (cfg.provider === "openai" && !cfg.baseUrl) throw new AiError("Thiếu địa chỉ cổng AI. Tổ trưởng vào mục Cài đặt AI để nhập.", 503);

  const supabase = await createClient();
  const limit =
    profile.role === "to_truong"
      ? Number(process.env.AI_DAILY_LIMIT_LEADER) || DEFAULT_AI_DAILY_LIMIT_LEADER
      : Number(process.env.AI_DAILY_LIMIT_TEACHER) || DEFAULT_AI_DAILY_LIMIT_TEACHER;
  const since = `${todayVN()}T00:00:00+07:00`;
  const { count } = await supabase
    .from("shcm_ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) throw new AiError(`Hôm nay bạn đã dùng hết ${limit} lượt AI. Mai dùng tiếp nhé.`, 429);
  return { supabase, profile, cfg };
}

async function logUsage(g: Guard, feature: string, usage?: { input_tokens?: number; output_tokens?: number }) {
  await g.supabase.from("shcm_ai_usage").insert({
    user_id: g.profile.id,
    feature,
    tokens_in: usage?.input_tokens ?? null,
    tokens_out: usage?.output_tokens ?? null,
  });
}

export type Block = Anthropic.Messages.ContentBlockParam;

export const SYSTEM_BASE = `Bạn hỗ trợ tổ chuyên môn khối 4 của một trường tiểu học ở TP.HCM viết biên bản sinh hoạt chuyên môn.
Viết tiếng Việt tự nhiên, ngắn gọn, giọng của một giáo viên viết cho đồng nghiệp, không văn máy, không sáo rỗng.
Chỉ dùng thông tin có trong dữ liệu được đưa. Không bịa số liệu, tên người, ngày tháng. Thiếu thông tin thì để trống hoặc ghi rõ là chưa có.
Sinh hoạt chuyên môn theo hướng nghiên cứu bài học: bàn về việc học của học sinh, không chấm điểm hay xếp loại giờ dạy của đồng nghiệp.`;

export async function askText(g: Guard, feature: string, system: string, content: string | Block[], maxTokens = 1500): Promise<string> {
  if (g.cfg.provider === "openai") {
    try {
      const j = await openaiChat({ cfg: g.cfg, system, content, maxTokens });
      await logUsage(g, feature, { input_tokens: j.usage?.prompt_tokens, output_tokens: j.usage?.completion_tokens });
      return String(j.choices?.[0]?.message?.content ?? "").trim();
    } catch (e) { throw wrap(e); }
  }
  const client = anthropicClient(g.cfg);
  try {
    const res = await client.messages.create({
      model: g.cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    });
    await logUsage(g, feature, res.usage);
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch (e) {
    throw wrap(e);
  }
}

export async function askTool<T>(
  g: Guard, feature: string, system: string, content: string | Block[],
  tool: { name: string; description: string; input_schema: Anthropic.Messages.Tool.InputSchema },
  maxTokens = 4000,
): Promise<T> {
  if (g.cfg.provider === "openai") {
    try {
      const j = await openaiChat({
        cfg: g.cfg, system, content, maxTokens,
        tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
        tool_choice: { type: "function", function: { name: tool.name } },
      });
      await logUsage(g, feature, { input_tokens: j.usage?.prompt_tokens, output_tokens: j.usage?.completion_tokens });
      const msg = j.choices?.[0]?.message;
      const raw = msg?.tool_calls?.[0]?.function?.arguments ?? msg?.content ?? "";
      const text = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, "");
      try { return JSON.parse(text) as T; } catch { throw new AiError("AI chưa trả về kết quả đúng dạng. Thử lại giúp.", 502); }
    } catch (e) { throw wrap(e); }
  }
  const client = anthropicClient(g.cfg);
  try {
    const res = await client.messages.create({
      model: g.cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    });
    await logUsage(g, feature, res.usage);
    const use = res.content.find((b) => b.type === "tool_use");
    if (!use || use.type !== "tool_use") throw new AiError("AI chưa trả về kết quả đúng dạng. Thử lại giúp.", 502);
    return use.input as T;
  } catch (e) {
    throw wrap(e);
  }
}

function wrap(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate|429|overloaded|529/i.test(msg)) return new AiError("AI đang quá tải, thử lại sau ít phút.", 503);
  return new AiError("AI gặp lỗi: " + msg.slice(0, 200), 502);
}

/** Đọc tệp trong kho thành nội dung gửi cho AI (PDF → document, docx → văn bản, ảnh → image). */
export async function fileToBlocks(g: Guard, storagePath: string, fileName: string, mime: string | null): Promise<Block[]> {
  const { data, error } = await g.supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new AiError("Không đọc được tệp: " + (error?.message ?? ""), 404);
  const buf = Buffer.from(await data.arrayBuffer());
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") {
    if (buf.length > 30 * 1024 * 1024) throw new AiError("Tệp PDF lớn quá, AI chưa đọc được.", 413);
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }];
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value.trim()) throw new AiError("Tệp Word không có chữ để đọc.", 422);
    return [{ type: "text", text: `Nội dung tệp "${fileName}":\n\n${value.slice(0, 150000)}` }];
  }
  if (mime?.startsWith("image/") && /png|jpe?g|gif|webp/.test(mime)) {
    return [{ type: "image", source: { type: "base64", media_type: mime as "image/png", data: buf.toString("base64") } }];
  }
  throw new AiError("AI chỉ đọc được tệp PDF, Word (.docx) hoặc ảnh. Với tệp .doc cũ, bạn lưu lại thành .docx giúp.", 415);
}

export function errorResponse(e: unknown): Response {
  const err = e instanceof AiError ? e : new AiError("Có lỗi: " + (e instanceof Error ? e.message : String(e)), 500);
  return Response.json({ error: err.message }, { status: err.status });
}

// ------------------------------------------------------------------ Cổng kiểu OpenAI
type OAIPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

async function toOpenAIParts(content: string | Block[]): Promise<OAIPart[]> {
  if (typeof content === "string") return [{ type: "text", text: content }];
  const parts: OAIPart[] = [];
  for (const b of content) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "image" && b.source.type === "base64") {
      parts.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
    } else if (b.type === "document" && b.source.type === "base64") {
      // PDF: lấy chữ ra gửi kèm, vì cổng kiểu OpenAI thường không nhận tệp PDF
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(b.source.data, "base64")));
      const { text } = await extractText(pdf, { mergePages: true });
      const t = (Array.isArray(text) ? text.join("\n") : text).trim();
      if (!t) throw new AiError("Tệp PDF này là ảnh chụp, chưa đọc được chữ. Thầy lưu bản Word (.docx) rồi tải lại giúp.", 422);
      parts.push({ type: "text", text: `Nội dung tệp PDF:\n\n${t.slice(0, 150000)}` });
    }
  }
  return parts;
}

async function openaiChat(o: {
  cfg: AiConfig; system: string; content: string | Block[]; maxTokens: number; tools?: unknown[]; tool_choice?: unknown;
}) {
  const res = await fetch(`${o.cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.cfg.apiKey}` },
    body: JSON.stringify({
      model: o.cfg.model,
      max_tokens: o.maxTokens,
      messages: [{ role: "system", content: o.system }, { role: "user", content: await toOpenAIParts(o.content) }],
      ...(o.tools ? { tools: o.tools, tool_choice: o.tool_choice } : {}),
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${txt.slice(0, 200)}`);
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error("Cổng AI trả về dữ liệu lạ: " + txt.slice(0, 120));
  }
}

/** Gửi một câu ngắn để kiểm tra khóa, địa chỉ và tên model. */
export async function testAiConnection(cfg: AiConfig): Promise<string> {
  if (cfg.provider === "openai") {
    const j = await openaiChat({ cfg, system: "Trả lời ngắn gọn.", content: "Trả lời đúng một chữ: có", maxTokens: 20 });
    return String(j.choices?.[0]?.message?.content ?? "").trim();
  }
  const res = await anthropicClient(cfg).messages.create({
    model: cfg.model,
    max_tokens: 20,
    messages: [{ role: "user", content: "Trả lời đúng một chữ: có" }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}
