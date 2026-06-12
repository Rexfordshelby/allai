import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/0001_manyai_schema.sql"),
  "utf8"
);

describe("Supabase migration", () => {
  it("creates the product tables", () => {
    for (const table of [
      "profiles",
      "conversations",
      "messages",
      "model_runs",
      "image_generations",
      "user_model_preferences"
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
  });

  it("enables RLS and user-owned storage policies", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("storage.objects");
    expect(migration).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });
});
