-- =====================================================================
-- Radius AI — МИГРАЦИЯ: настройки приложения (уведомления о заявках в Telegram)
-- Запускать в Supabase → SQL Editor. Идемпотентно, без удаления данных.
-- =====================================================================

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Таблицу читает/пишет только backend (service role). Включаем RLS без политик,
-- чтобы токен бота нельзя было прочитать anon-ключом.
alter table app_settings enable row level security;

-- ПРОВЕРКА:
--   select key, value - 'bot_token' as value, updated_at from app_settings;
