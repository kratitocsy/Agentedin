-- Optional tidy-up (clears the "extension in public" advisor warning). Run in the Supabase SQL editor.
-- The MCP tool holds DROP statements back for confirmation, so this one is run by hand. Nothing depends on pg_net until the schedule below exists.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
