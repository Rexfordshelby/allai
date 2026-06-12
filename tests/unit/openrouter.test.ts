import { describe, expect, it } from "vitest";
import { parseOpenRouterSseChunk } from "@/lib/ai/openrouter";

describe("parseOpenRouterSseChunk", () => {
  it("extracts streamed text deltas", () => {
    const chunk = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    expect(parseOpenRouterSseChunk(chunk)).toEqual(["Hello", " world"]);
  });

  it("ignores provider telemetry and malformed lines", () => {
    const chunk = [
      ": ping",
      "data: nope",
      "",
      'data: {"choices":[{"message":{"content":"done"}}]}',
      ""
    ].join("\n");

    expect(parseOpenRouterSseChunk(chunk)).toEqual(["done"]);
  });
});
