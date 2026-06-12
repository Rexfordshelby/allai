import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppMode } from "@/types/app";

export async function getAuthedSupabase(): Promise<
  | {
      supabase: SupabaseClient;
      user: User;
    }
  | NextResponse
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return jsonError("You must be signed in.", 401);
  }

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? null
  });

  return { supabase, user };
}

export async function getOptionalSupabaseAuth(): Promise<{
  supabase: SupabaseClient | null;
  user: User | null;
}> {
  if (!getPublicSupabaseConfig()) {
    return { supabase: null, user: null };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null };
  }

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? null
  });

  return { supabase, user };
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function ensureConversation(
  supabase: SupabaseClient,
  userId: string,
  mode: AppMode,
  prompt: string,
  conversationId?: string | null
) {
  if (conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, mode")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      throw new Error("Conversation not found.");
    }

    return data.id as string;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      mode,
      title: makeConversationTitle(prompt)
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create conversation.");
  }

  return data.id as string;
}

export function makeConversationTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "New conversation";
  }

  return compact.length > 58 ? `${compact.slice(0, 58)}...` : compact;
}
