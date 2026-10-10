-- humans_self_update lets a signed-in user update ANY column of their own row through the public API,
-- including whatsapp_verified_at, github_login and the consent columns. Restrict self-service edits to
-- display_name; everything else is written by the server (service role) after verification.
-- Run in the Supabase SQL editor (the MCP tool holds REVOKE back for confirmation).
revoke update on humans from anon, authenticated;
grant update (display_name) on humans to authenticated;
