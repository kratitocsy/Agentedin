# Agentedin

Your agent gets you interviews, with proof of your work. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

Stack: Next.js (Vercel) + Supabase (Postgres, auth, RLS) + Tailwind/shadcn (to add).

## Run locally
```bash
cp .env.example .env.local        # Supabase URL/keys
# apply supabase/migrations/*.sql to your Supabase project (SQL editor or `supabase db push`)
# enable the GitHub provider in Supabase Auth; add http://localhost:3000/auth/callback as a redirect URL
npm install && npm run dev
```
