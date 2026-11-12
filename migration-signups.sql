-- =====================================================================
-- DexaAI: регистрация и вход через Telegram-бота, кабинет новой компании, подписчики для рассылок.
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- Компании: статус подключения и анкета.
--   active  — платформа работает (как Radius Logistics);
--   pending — зарегистрировались сами: есть только кабинет с анкетой, остальное закрыто.
alter table companies add column if not exists status text not null default 'active';
alter table companies drop constraint if exists companies_status_check;
alter table companies add constraint companies_status_check check (status in ('active', 'pending'));
alter table companies add column if not exists profile jsonb not null default '{}'::jsonb;
alter table companies add column if not exists connect_requested_at timestamptz;
-- У зарегистрированных через Telegram нет логина и пароля компании.
alter table companies alter column login drop not null;
alter table companies alter column password_hash drop not null;

-- Люди: вход через Telegram вместо логина и пароля.
alter table app_users add column if not exists telegram_id bigint unique;
alter table app_users alter column login drop not null;
alter table app_users alter column password_hash drop not null;

-- Одноразовый код: сайт выдаёт его, человек открывает бота по ссылке t.me/<бот>?start=<код>,
-- бот привязывает к коду Telegram-аккаунт, сайт по коду входит в аккаунт.
create table if not exists dexa_signups (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,   -- человек нажал Start в боте
  consumed_at timestamptz,    -- сайт по этому коду вошёл (код больше не действует)
  telegram_id bigint,
  user_id uuid references app_users (id) on delete set null,
  is_new boolean,             -- зарегистрировался впервые или вошёл в существующий аккаунт
  lang text,
  ip text,
  user_agent text
);

-- Все, кто нажимал Start в боте DexaAI: база для рассылок.
create table if not exists dexa_bot_users (
  telegram_id bigint primary key,
  first_name text,
  last_name text,
  username text,
  language_code text,
  phone text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  blocked boolean not null default false     -- остановил/заблокировал бота: рассылку не слать
);

alter table dexa_signups enable row level security;
alter table dexa_bot_users enable row level security;

-- ПРОВЕРКА: у Radius Logistics статус active.
--   select name, login, status from companies;
