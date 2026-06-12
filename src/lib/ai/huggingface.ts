import { InferenceClient } from "@huggingface/inference";
import { shouldUseMockAi } from "@/lib/env";

type GenerateImageInput = {
  prompt: string;
  negativePrompt?: string | null;
  model: string;
  width: number;
  height: number;
  seed?: number | null;
};

export async function generateImageBytes(input: GenerateImageInput) {
  if (shouldUseMockAi()) {
    return createMockPng();
  }

  const client = new InferenceClient(process.env.HF_TOKEN);
  const blob = await client.textToImage({
    model: input.model,
    inputs: input.prompt,
    parameters: {
      negative_prompt: input.negativePrompt ?? undefined,
      width: input.width,
      height: input.height,
      seed: input.seed ?? undefined
    }
  }, {
    outputType: "blob"
  });

  return {
    bytes: Buffer.from(await blob.arrayBuffer()),
    contentType: blob.type || "image/png"
  };
}

function createMockPng() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

  return {
    bytes: Buffer.from(base64, "base64"),
    contentType: "image/png"
  };
}
