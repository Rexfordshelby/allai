import { shouldUseMockAi } from "@/lib/env";

type GenerateImageInput = {
  prompt: string;
  negativePrompt?: string | null;
  model: string;
  width: number;
  height: number;
  seed?: number | null;
};

const POLLINATIONS_IMAGE_URL =
  "https://gen.pollinations.ai/v1/images/generations";

export async function generateImageBytes(input: GenerateImageInput) {
  if (shouldUseMockAi()) {
    return createMockPng();
  }

  const headers: HeadersInit = {};
  if (process.env.POLLINATIONS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
  }
  headers["Content-Type"] = "application/json";

  const response = await fetch(POLLINATIONS_IMAGE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      negative_prompt: input.negativePrompt || undefined,
      size: `${input.width}x${input.height}`,
      seed: input.seed ?? undefined,
      response_format: "b64_json"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Pollinations image generation failed (${response.status}): ${message.slice(0, 240)}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const result = payload.data?.[0];

  if (result?.b64_json) {
    return {
      bytes: Buffer.from(result.b64_json, "base64"),
      contentType: "image/jpeg"
    };
  }

  if (result?.url) {
    const imageResponse = await fetch(result.url, { cache: "no-store" });
    if (!imageResponse.ok) {
      throw new Error(`Pollinations image download failed (${imageResponse.status})`);
    }

    return {
      bytes: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") ?? "image/jpeg"
    };
  }

  throw new Error("Pollinations did not return an image.");
}

function createMockPng() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

  return {
    bytes: Buffer.from(base64, "base64"),
    contentType: "image/png"
  };
}
