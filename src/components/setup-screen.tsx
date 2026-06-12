import { Database, KeyRound, ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-panel" aria-labelledby="setup-title">
        <div className="brand-row">
          <div className="brand-mark">M</div>
          <div>
            <p className="eyebrow">Setup required</p>
            <h1 id="setup-title">{APP_NAME}</h1>
          </div>
        </div>

        <p className="setup-copy">
          Add Supabase public credentials before running the app. Provider keys
          stay server-side in environment variables and are never bundled into
          the browser.
        </p>

        <div className="setup-grid">
          <div className="setup-item">
            <KeyRound aria-hidden="true" />
            <span>NEXT_PUBLIC_SUPABASE_URL</span>
          </div>
          <div className="setup-item">
            <ShieldCheck aria-hidden="true" />
            <span>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
          </div>
          <div className="setup-item">
            <Database aria-hidden="true" />
            <span>Run supabase/migrations/0001_manyai_schema.sql</span>
          </div>
        </div>

        <p className="setup-note">
          Copy values from `.env.example` into `.env.local`, then restart the
          dev server.
        </p>
      </section>
    </main>
  );
}
