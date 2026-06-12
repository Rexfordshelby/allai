"use client";

import { FormEvent, useState } from "react";
import { Loader2, LogIn, Mail, Sparkles, UserPlus } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AuthMode = "sign-in" | "sign-up";

function getAuthCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return `${appUrl || window.location.origin}/auth/callback`;
}

export function AuthScreen() {
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSending(true);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
        shouldCreateUser: authMode === "sign-up"
      }
    });

    if (error) {
      setStatus(error.message);
      setIsSending(false);
      return;
    }

    setStatus(
      authMode === "sign-up"
        ? "Check your email to finish creating your account."
        : "Check your email for the sign-in link."
    );
    setIsSending(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-row">
          <div className="brand-mark">M</div>
          <div>
            <p className="eyebrow">Unified AI workspace</p>
            <h1 id="auth-title">{APP_NAME}</h1>
          </div>
        </div>

        <p className="auth-copy">
          {authMode === "sign-up"
            ? "Create an account to save chats, comparisons, and generated images."
            : "Sign in to keep your chats, comparisons, and generated images in one place."}
        </p>

        <div className="auth-switch" role="tablist" aria-label="Authentication mode">
          <button
            className={authMode === "sign-in" ? "active" : ""}
            onClick={() => {
              setAuthMode("sign-in");
              setStatus(null);
            }}
            type="button"
          >
            <LogIn aria-hidden="true" />
            <span>Sign in</span>
          </button>
          <button
            className={authMode === "sign-up" ? "active" : ""}
            onClick={() => {
              setAuthMode("sign-up");
              setStatus(null);
            }}
            type="button"
          >
            <UserPlus aria-hidden="true" />
            <span>Sign up</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <div className="input-with-icon">
            <Mail aria-hidden="true" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <button className="primary-button" disabled={isSending} type="submit">
            {isSending ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            <span>
              {isSending
                ? "Sending link"
                : authMode === "sign-up"
                  ? "Create account"
                  : "Send sign-in link"}
            </span>
          </button>
        </form>

        {status ? <p className="status-line">{status}</p> : null}
      </section>
    </main>
  );
}
