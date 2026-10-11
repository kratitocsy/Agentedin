-- Run ONLY after the app is deployed and Vercel Authentication is off for production (otherwise every call gets a 401).
-- The bearer secret is read from Supabase Vault at call time; it is never copied anywhere.
-- If you later move to a custom domain, update the URL below (select cron.unschedule('agentedin-dispatch'); then schedule again).
select cron.schedule('agentedin-dispatch', '* * * * *', $job$
  select net.http_post(
    url := 'https://agentedin-iota.vercel.app/api/cron/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$job$);
