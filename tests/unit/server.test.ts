import { describe, expect, it } from "vitest";
import { makeConversationTitle } from "@/lib/api/server";

describe("makeConversationTitle", () => {
  it("compacts whitespace and trims long titles", () => {
    const title = makeConversationTitle(
      "   Build    a comparison view for five different models with streaming output   "
    );

    expect(title).toBe("Build a comparison view for five different models with str...");
  });

  it("uses a fallback for blank prompts", () => {
    expect(makeConversationTitle("   ")).toBe("New conversation");
  });
});
