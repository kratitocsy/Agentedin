# Agentedin

Autonomous agent-based hiring platform (MVP). Monorepo: `frontend/` (Next.js), `backend/` (Express + PostgreSQL).

## Run locally
```bash
cp .env.example backend/.env   # fill in GitHub OAuth + JWT_SECRET
cd backend && npm install && npm run migrate && npm run dev
cd frontend && npm install && npm run dev
```
GitHub OAuth app callback URL: `http://localhost:4000/api/auth/github/callback`.
