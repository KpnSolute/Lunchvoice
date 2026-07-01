-- Keepalive: ping the deployed Render URL every 10 minutes.
-- A Render *static site* doesn't sleep, so this is belt-and-suspenders (and ready if a
-- web service / edge function is added later). Run this in the Supabase SQL editor AFTER
-- you know your Render URL. Replace the URL below.
--
-- Requires pg_cron + pg_net (enable under Database → Extensions if not already on).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'keepalive-render',
  '*/10 * * * *',
  $$ select net.http_get('https://YOUR-APP.onrender.com/'); $$
);

-- To inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('keepalive-render');
