import { AuthScreen } from "@/components/auth-screen";
import { ManyAiApp } from "@/components/many-ai-app";
import { SetupScreen } from "@/components/setup-screen";
import { getPublicSupabaseConfig } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Home() {
  if (!getPublicSupabaseConfig()) {
    return <SetupScreen />;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <ManyAiApp
      user={{
        id: user.id,
        email: user.email ?? "Signed in"
      }}
    />
  );
}
