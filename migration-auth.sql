-- =====================================================================
-- DexaAI: вход в платформу (компания → выбор человека → пароль).
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
--
-- Здесь только таблицы. Компанию, людей и их пароли (хешами scrypt) добавляет
-- отдельный скрипт, который НЕ хранится в репозитории.
-- =====================================================================

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  login text not null unique check (login = lower(login)),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'manager', 'admin')),
  login text not null unique check (login = lower(login)),
  password_hash text not null,
  -- Менеджер в очереди заявок: по нему фильтруются «свои» заявки.
  manager_id uuid references managers (id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Таблицы читает только backend (service role). RLS без политик закрывает их от anon-ключа.
alter table companies enable row level security;
alter table app_users enable row level security;

-- ПРОВЕРКА: у Жасура и Хуршида должен быть заполнен manager_id.
--   select u.name, u.role, u.login, m.name as manager from app_users u left join managers m on m.id = u.manager_id order by u.sort_order;
