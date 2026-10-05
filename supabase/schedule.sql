-- Optional: refresh house points from Arbor every 10 minutes during the school day.
-- Vercel's free plan only runs its own schedule once a day (7am), so this asks the screens' Supabase project to call
-- the sync every 10 minutes instead. Run it in the screens' OWN Supabase project (never the Tutor Slides one),
-- after the site is on Vercel and CRON_SECRET is set there.
-- Replace YOUR-SITE with the Vercel address and PASTE-CRON-SECRET with the same value as Vercel's CRON_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('screens-house-points') where exists (select 1 from cron.job where jobname = 'screens-house-points');
select cron.schedule(
  'screens-house-points',
  '*/10 7-16 * * 1-5',   -- every 10 minutes, 7am to 4:50pm (UTC), Monday to Friday
  $$ select net.http_get(
       url := 'https://YOUR-SITE.vercel.app/api/sync-house-points',
       headers := jsonb_build_object('Authorization', 'Bearer PASTE-CRON-SECRET')
     ) $$
);
