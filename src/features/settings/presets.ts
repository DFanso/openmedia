import type { ProviderKind } from "../../shared/ipc";

export interface Preset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  placeholder?: string;
}

/** Starting points only. Every field stays editable, and Rust validates what is saved. */
export const PRESETS: Preset[] = [
  { id: "anthropic", label: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com" },
  { id: "openai", label: "OpenAI", kind: "openAiCompatible", baseUrl: "https://api.openai.com/v1" },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "openAiCompatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openAiCompatible",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "opencode-zen",
    label: "OpenCode Zen",
    kind: "openAiCompatible",
    baseUrl: "https://opencode.ai/inference/openai/v1",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openAiCompatible",
    baseUrl: "",
    placeholder: "http://localhost:11434/v1",
  },
];

export const MAX_FAVORITES = 6;
export const MAX_FAVORITE_NAME = 20;
/** Mirrors `MAX_BOTTOM_MARGIN` in `library.rs`, which is what enforces it. */
export const MAX_BOTTOM_MARGIN = 200;
