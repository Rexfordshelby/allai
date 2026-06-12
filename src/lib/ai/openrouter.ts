import { DEFAULT_TEXT_MODELS } from "@/lib/constants";
import { shouldUseMockAi } from "@/lib/env";
import type { ChatMessage, ModelOption } from "@/types/app";

type StreamCallbacks = {
  onToken: (token: string) => void | Promise<void>;
  signal?: AbortSignal;
};

type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

let modelCache:
  | {
      expiresAt: number;
      models: ModelOption[];
    }
  | undefined;

export function openRouterHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    "X-OpenRouter-Title": process.env.NEXT_PUBLIC_APP_NAME ?? "Luma AI"
  };
}

export async function listOpenRouterModels(): Promise<ModelOption[]> {
  if (modelCache && modelCache.expiresAt > Date.now()) {
    return modelCache.models;
  }

  const headers = openRouterHeaders();

  if (!headers || shouldUseMockAi()) {
    return DEFAULT_TEXT_MODELS;
  }

  const response = await fetch(
    `${OPENROUTER_MODELS_URL}?output_modalities=text&sort=most-popular`,
    {
      headers,
      next: { revalidate: 60 * 60 }
    }
  );

  if (!response.ok) {
    return DEFAULT_TEXT_MODELS;
  }

  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  const models =
    payload.data
      ?.filter((model) =>
        model.architecture?.output_modalities?.includes("text")
      )
      .slice(0, 80)
      .map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        description: model.description,
        contextLength: model.context_length,
        promptPrice: model.pricing?.prompt,
        completionPrice: model.pricing?.completion
      })) ?? DEFAULT_TEXT_MODELS;

  modelCache = {
    expiresAt: Date.now() + 60 * 60 * 1000,
    models
  };

  return models.length ? models : DEFAULT_TEXT_MODELS;
}

export function parseOpenRouterSseChunk(chunk: string): string[] {
  const tokens: string[] = [];
  const events = chunk.split("\n\n");

  for (const event of events) {
    const dataLines = event
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""));

    for (const data of dataLines) {
      if (!data || data === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const content =
          parsed.choices?.[0]?.delta?.content ??
          parsed.choices?.[0]?.message?.content;

        if (content) {
          tokens.push(content);
        }
      } catch {
        // Some providers emit comments or telemetry events. Ignore non-JSON lines.
      }
    }
  }

  return tokens;
}

export async function streamOpenRouterChat(
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks
) {
  if (shouldUseMockAi() || !process.env.OPENROUTER_API_KEY) {
    await streamMockChat(model, messages, callbacks);
    return;
  }

  const headers = openRouterHeaders();

  if (!headers) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers,
    signal: callbacks.signal,
    body: JSON.stringify({
      model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      stream: true,
      temperature: 0.7,
      max_tokens: 1600
    })
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter request failed (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf("\n\n");

    if (boundary === -1) {
      continue;
    }

    const complete = buffer.slice(0, boundary + 2);
    buffer = buffer.slice(boundary + 2);

    for (const token of parseOpenRouterSseChunk(complete)) {
      await callbacks.onToken(token);
    }
  }

  if (buffer) {
    for (const token of parseOpenRouterSseChunk(buffer)) {
      await callbacks.onToken(token);
    }
  }
}

async function streamMockChat(
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks
) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = [
    `Mock response from ${model}. `,
    "This local fallback is active because the provider key is missing or USE_MOCK_AI=true. ",
    lastUser ? `You asked: "${lastUser.content.slice(0, 180)}"` : ""
  ].join("");

  for (const token of text.match(/.{1,18}/g) ?? [text]) {
    await new Promise((resolve) => setTimeout(resolve, 18));
    await callbacks.onToken(token);
  }
}
