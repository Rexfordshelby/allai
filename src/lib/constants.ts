import type { ModelOption } from "@/types/app";

const configuredAppName = process.env.NEXT_PUBLIC_APP_NAME?.trim();

export const APP_NAME =
  configuredAppName && configuredAppName !== "ManyAI"
    ? configuredAppName
    : "Luma AI";

export const MAX_COMPARE_MODELS = 6;
export const MAX_CHAT_PROMPT_CHARS = 8_000;
export const MAX_IMAGE_PROMPT_CHARS = 1_500;

export const DEFAULT_TEXT_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Fast general-purpose assistant"
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Claude Haiku",
    description: "Quick writing and reasoning"
  },
  {
    id: "google/gemini-flash-1.5",
    name: "Gemini Flash",
    description: "Low-latency multimodal-friendly model"
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct:free",
    name: "Llama 3.1 8B Free",
    description: "Open model option for tests"
  }
];

export const DEFAULT_COMPARE_MODELS = DEFAULT_TEXT_MODELS.slice(0, 3).map(
  (model) => model.id
);

export const DEFAULT_IMAGE_MODELS = [
  "flux",
  "gptimage",
  "kontext",
  "zimage"
];

export const IMAGE_SIZES = [
  { label: "Square", width: 1024, height: 1024 },
  { label: "Landscape", width: 1024, height: 768 },
  { label: "Portrait", width: 768, height: 1024 }
];

export const GENERATED_IMAGES_BUCKET = "generated-images";
