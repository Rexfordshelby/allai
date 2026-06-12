import { z } from "zod";
import {
  DEFAULT_IMAGE_MODELS,
  MAX_CHAT_PROMPT_CHARS,
  MAX_COMPARE_MODELS,
  MAX_IMAGE_PROMPT_CHARS
} from "@/lib/constants";

export const historyMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(MAX_CHAT_PROMPT_CHARS),
  model_id: z.string().optional().nullable()
});

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  model: z.string().min(1).max(160),
  prompt: z.string().min(1).max(MAX_CHAT_PROMPT_CHARS),
  history: z.array(historyMessageSchema).max(40).default([])
});

export const compareRequestSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  models: z
    .array(z.string().min(1).max(160))
    .min(1)
    .max(MAX_COMPARE_MODELS),
  prompt: z.string().min(1).max(MAX_CHAT_PROMPT_CHARS),
  history: z.array(historyMessageSchema).max(20).default([])
});

export const imageRequestSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  prompt: z.string().min(1).max(MAX_IMAGE_PROMPT_CHARS),
  negativePrompt: z.string().max(MAX_IMAGE_PROMPT_CHARS).optional().nullable(),
  model: z.string().min(1).max(180).default(DEFAULT_IMAGE_MODELS[0]),
  width: z.number().int().min(512).max(1536).default(1024),
  height: z.number().int().min(512).max(1536).default(1024),
  seed: z.number().int().min(0).max(2_147_483_647).optional().nullable()
});
