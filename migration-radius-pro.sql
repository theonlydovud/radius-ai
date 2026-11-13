-- =====================================================================
-- Radius Logistics — на тариф Pro со всеми ограничениями тарифа
-- (10 000 сообщений за период, 6 пользователей, 1 Instagram, оплаченный период 30 дней),
-- кроме одного: в аккаунт можно входить с любого количества устройств (multi_device).
--
-- Выполнить в Supabase → SQL Editor ПОСЛЕ деплоя backend на Render.
-- Повторный запуск безопасен, но заново начнёт период и обнулит счётчик.
-- =====================================================================

begin;

alter table companies add column if not exists multi_device boolean not null default false;

update companies
set unlimited = false,
    multi_device = true,
    plan = 'pro',
    status = 'active',
    trial_ends_at = null,
    period_start = now(),
    period_end = now() + interval '30 days',
    messages_used = 0,
    limit_notified_at = null
where login = 'radius_logistics';

commit;

-- ПРОВЕРКА:
--   select name, plan, unlimited, multi_device, period_end, messages_used from companies where login = 'radius_logistics';
--
-- Продление Radius (новый период 30 дней, счётчик с нуля):
--   update companies set period_start = now(), period_end = now() + interval '30 days', messages_used = 0, limit_notified_at = null
--   where login = 'radius_logistics';
