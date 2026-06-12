# ManyAI

ManyAI is a Next.js app for chatting with one AI model, comparing several
OpenRouter models side by side, and generating images through Pollinations AI.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add Supabase values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Add server-only provider secrets:
   - `OPENROUTER_API_KEY`
   - `POLLINATIONS_API_KEY`
   - `DATABASE_URL`
4. Set `NEXT_PUBLIC_APP_URL` to the real deployed web URL, for example
   `https://allai-pink.vercel.app`. Supabase magic links use this URL for auth
   callbacks.
5. Run `supabase/migrations/0001_manyai_schema.sql` in the Supabase SQL editor
   or through your migration workflow.
6. Start the app with `npm run dev`.

In Supabase Auth settings, add the deployed callback URL to allowed redirect
URLs, for example `https://allai-pink.vercel.app/auth/callback`.

Provider secrets must stay server-side. Do not place OpenRouter, Pollinations,
database, or service-role secrets in frontend code.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Notes

- `USE_MOCK_AI=true` makes chat and image routes use local mock responses.
- Compare mode is capped at 6 models per request.
- Generated images upload to the private `generated-images` Supabase Storage
  bucket and are read back through signed URLs.
