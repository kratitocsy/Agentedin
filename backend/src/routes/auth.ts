import crypto from "node:crypto";
import { Router } from "express";
import { pool } from "../db.js";
import { COOKIE_NAME, requireAuth, signSession } from "../middleware/auth.js";
import * as github from "../services/github.js";
import { audit } from "../utils/audit.js";

const router = Router();
const STATE_COOKIE = "agentedin_oauth_state";

router.get("/github", (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
  res.redirect(github.authorizeUrl(state));
});

router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;
  if (typeof code !== "string" || !state || state !== req.cookies?.[STATE_COOKIE]) {
    return res.status(400).json({ error: "Invalid OAuth state" });
  }
  res.clearCookie(STATE_COOKIE);
  try {
    const token = await github.exchangeCode(code);
    const [ghUser, email] = await Promise.all([github.getUser(token), github.getPrimaryEmail(token).catch(() => null)]);
    const { rows } = await pool.query(
      `INSERT INTO users (github_id, github_login, email, profile_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE
         SET github_login = EXCLUDED.github_login, email = EXCLUDED.email,
             profile_data = EXCLUDED.profile_data, updated_at = now()
       RETURNING id, role`,
      [ghUser.id, ghUser.login, email, { name: ghUser.name, avatar_url: ghUser.avatar_url, followers: ghUser.followers, public_repos: ghUser.public_repos }],
    );
    await pool.query("INSERT INTO developer_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [rows[0].id]);
    await audit(rows[0].id, "auth.login", "user", rows[0].id, { provider: "github" });
    res.cookie(COOKIE_NAME, signSession(rows[0]), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.redirect(`${process.env.FRONTEND_URL}/developer/profile`);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "GitHub login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.github_login, u.email, u.role, u.profile_data, p.skills, p.experience, p.preferences
     FROM users u LEFT JOIN developer_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [req.user!.id],
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

export default router;
