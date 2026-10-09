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

## Conventions (for teammates)
- **UI:** Tailwind + shadcn/ui. Add components with `npx shadcn@latest add <name>` (`components.json` is configured); they land in `components/ui/`.
- **Data:** typed Supabase clients (`lib/supabase/server.ts`). Regenerate `types/database.ts` after every migration.
- **Auth/data access:** use the user-scoped client so RLS applies. The service-role key is only for `lib/audit.ts` and verified-evidence writes.
- **SEO:** metadata defaults in `app/layout.tsx`, `app/robots.ts`, `app/sitemap.ts`. Signed-in pages are `noindex`; public profile pages (Phase 5) should be server-rendered with `generateMetadata`.
- **Validation:** `zod` at every server action / API boundary.
