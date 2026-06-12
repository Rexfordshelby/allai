"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseConfig } from "@/lib/env";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = requirePublicSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
