/** Model có sẵn của API-LIT (giá USD cho 1 triệu token: vào / ra). Không gồm các bản Thinking vì không hợp với kiểu gọi có cấu trúc của app. */
export type AiPreset = { label: string; model: string; kind: "anthropic" | "openai"; baseUrl: string };

const A = "https://apilit.dev";
const O = "https://apilit.dev/v1";
const claude = (label: string, model: string): AiPreset => ({ label, model, kind: "anthropic", baseUrl: A });
const other = (label: string, model: string): AiPreset => ({ label, model, kind: "openai", baseUrl: O });

export const PRESETS: AiPreset[] = [
  claude("Claude Haiku 5.5 · $0,5/$2", "pro/claude-haiku-5-5"),
  claude("Claude Sonnet 5.5 · $2/$10", "pro/claude-sonnet-5-5-medium"),
  claude("Claude Sonnet 5 · $2/$10", "pro/claude-sonnet-5-medium"),
  claude("Claude Opus 5.5 · $6/$30", "pro/claude-opus-5-5-medium"),
  claude("Claude Opus 5 · $4,55/$22,75", "pro/claude-opus-5-medium"),
  claude("Claude Fable 5.1 · $10/$50", "pro/claude-fable-5-1-medium"),
  claude("Claude Opus 4.8 · $6/$30", "pro/claude-opus-4-8-medium"),
  claude("Claude Opus 4.7 · $6/$30", "pro/claude-opus-4-7-medium"),
  claude("Claude Opus 4.6 · $5/$25", "pro/claude-opus-4-6-medium"),
  claude("Claude Sonnet 4.6 · $3/$15", "pro/claude-sonnet-4-6-medium"),
  claude("Claude Haiku 4.5 · $1/$5", "pro/claude-haiku-4-5"),
  other("GPT-5.6 Luna · $1/$6,5", "pro/gpt-5.6-luna"),
  other("GPT-5.6 Terra · $3,67/$22", "pro/gpt-5.6-terra"),
  other("GPT-5.6 Sol · $7,33/$45", "pro/gpt-5.6-sol"),
  other("Kimi K3 · $6/$30", "pro/kimi-k3-medium"),
  other("MiniMax M2.5 · $0,5/$2", "pro/minimax-m2.5"),
  other("MiniMax M2.1 · $0,3/$1,5", "pro/minimax-m2.1"),
  other("GLM-5 · $1/$5", "pro/glm-5"),
];
