-- =====================================================================
-- Бэкенд без своего сервера (Vercel), 24.11.2026
--
-- 1. messages.external_id — id сообщения Instagram: Meta иногда присылает одно сообщение
--    дважды, раньше повторы отсекала память сервера, теперь — база.
-- 2. chat_sessions.reply_lock_at — блокировка диалога на время ответа: пауза склейки
--    больше не таймер в памяти, и два ответа сразу не должны уйти.
-- 3. Планировщик: раз в минуту Supabase вызывает /api/cron/tick (напоминания,
--    ответы без ответа, токены Instagram, вебхуки Telegram).
--    <CRON_URL> и <CRON_SECRET> подставляются при запуске (секрет — в Vercel, не в git).
--
-- Выполнить в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

alter table messages add column if not exists external_id text;
create unique index if not exists messages_session_external_id_key on messages (session_id, external_id) where external_id is not null;

alter table chat_sessions add column if not exists reply_lock_at timestamptz;

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'dexa-tick';
select cron.schedule(
  'dexa-tick',
  '* * * * *',
  $$ select net.http_post(
       url := '<CRON_URL>',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', '<CRON_SECRET>'),
       body := '{}'::jsonb,
       timeout_milliseconds := 55000
     ) $$
);

-- ПРОВЕРКА:
--   select jobname, schedule, active from cron.job;
--   select status_code, created from net._http_response order by created desc limit 5;
