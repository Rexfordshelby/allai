import { describe, expect, it } from "vitest";
import { MAX_COMPARE_MODELS } from "@/lib/constants";
import {
  chatRequestSchema,
  compareRequestSchema,
  imageRequestSchema
} from "@/lib/api/validation";

describe("request validation", () => {
  it("accepts a normal chat payload", () => {
    const parsed = chatRequestSchema.safeParse({
      model: "openai/gpt-4o-mini",
      prompt: "hello"
    });

    expect(parsed.success).toBe(true);
  });

  it("caps compare fan-out", () => {
    const parsed = compareRequestSchema.safeParse({
      models: Array.from({ length: MAX_COMPARE_MODELS + 1 }, (_, index) => `m${index}`),
      prompt: "compare this"
    });

    expect(parsed.success).toBe(false);
  });

  it("fills image defaults", () => {
    const parsed = imageRequestSchema.parse({
      prompt: "a clean dashboard"
    });

    expect(parsed.width).toBe(1024);
    expect(parsed.height).toBe(1024);
    expect(parsed.model).toBe("flux");
  });
});
