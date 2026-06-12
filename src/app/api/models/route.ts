import { NextResponse } from "next/server";
import { listOpenRouterModels } from "@/lib/ai/openrouter";

export const runtime = "nodejs";

export async function GET() {
  const models = await listOpenRouterModels();
  return NextResponse.json({ models });
}
