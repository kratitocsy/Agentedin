# Architecture

Layers: client channels (Slack, Email, WhatsApp) → omnichannel connectors → external data
(GitHub, LeetCode, HackerRank, Levels.fyi) → core API & agent engine (NLP parser, matching,
negotiation agent, offer letters) → Wynkogent security & governance (auth, authz, rate limits,
bounds validation, fraud detection, audit trail) → data & storage (PostgreSQL, Redis, S3, audit log).

Stack: Next.js + Express (TypeScript), PostgreSQL, Redis, Bolt SDK, Nodemailer, Twilio, Puppeteer.

See the Week 5–8 roadmap for the build plan. Implemented so far: Week 5 Day 1–2.
