-- =====================================================================
-- DexaAI: у каждой компании свои данные + пробный период 14 дней.
--
-- Что делает:
--   * компании: пробный период (status = trial, trial_ends_at), тип заявок
--     (cargo — груз/маршрут/вес, как у Radius; generic — «что хочет клиент»),
--     поддомен, уведомления о заявках в Telegram-группу;
--   * Instagram-аккаунты, менеджеры и заявки привязываются к компании
--     (всё, что уже есть, — к Radius Logistics);
--   * очередь менеджеров (round-robin) — своя у каждой компании.
--
-- КАК ЗАПУСКАТЬ: Supabase → SQL Editor, целиком. Два раза:
--   1) до деплоя backend на Render;
--   2) ещё раз сразу после деплоя — подхватит заявки, которые старый backend
--      успел создать в промежутке без компании.
-- Повторный запуск безопасен, данные не удаляются.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Компании
-- ---------------------------------------------------------------------
alter table companies add column if not exists trial_ends_at timestamptz;
alter table companies add column if not exists lead_kind text not null default 'generic';
alter table companies add column if not exists subdomain text;
alter table companies add column if not exists telegram_leads boolean not null default false;

alter table companies drop constraint if exists companies_status_check;
-- pending оставлен, чтобы регистрации не падали, пока на Render ещё старый backend.
alter table companies add constraint companies_status_check check (status in ('active', 'trial', 'pending'));
alter table companies drop constraint if exists companies_lead_kind_check;
alter table companies add constraint companies_lead_kind_check check (lead_kind in ('cargo', 'generic'));
create unique index if not exists idx_companies_subdomain on companies (lower(subdomain)) where subdomain is not null;

-- Кто уже зарегистрировался — получает 14 дней с сегодняшнего дня.
update companies
set status = 'trial', trial_ends_at = coalesce(trial_ends_at, now() + interval '14 days')
where status = 'pending';

do $$
declare
  rid uuid;
begin
  select id into rid from companies where login = 'radius_logistics';
  if rid is null then
    raise exception 'Не найдена компания radius_logistics — миграция остановлена, ничего не изменено.';
  end if;
  update companies set lead_kind = 'cargo', subdomain = 'radius', telegram_leads = true where id = rid;
end $$;

-- ---------------------------------------------------------------------
-- 2. Данные компании: аккаунты, менеджеры, заявки
--    (переписка и база знаний принадлежат аккаунту, а он — компании)
-- ---------------------------------------------------------------------
alter table accounts add column if not exists company_id uuid references companies (id) on delete cascade;
alter table managers add column if not exists company_id uuid references companies (id) on delete cascade;
alter table leads    add column if not exists company_id uuid references companies (id) on delete cascade;

update accounts set company_id = (select id from companies where login = 'radius_logistics') where company_id is null;
update managers set company_id = (select id from companies where login = 'radius_logistics') where company_id is null;
-- Заявка из переписки — компании её аккаунта; ручная/без аккаунта — Radius.
update leads l
set company_id = coalesce(
  (select a.company_id from chat_sessions s join accounts a on a.id = s.account_id where s.id = l.session_id),
  (select id from companies where login = 'radius_logistics')
)
where l.company_id is null;

create index if not exists idx_accounts_company on accounts (company_id);
create index if not exists idx_managers_company on managers (company_id);
create index if not exists idx_leads_company_created on leads (company_id, created_at desc);

-- Имена менеджеров уникальны внутри компании, а не на всю платформу.
drop index if exists idx_managers_name_unique;
create unique index if not exists idx_managers_company_name_unique on managers (company_id, lower(name));

-- ---------------------------------------------------------------------
-- 3. Очередь менеджеров — своя у каждой компании
-- ---------------------------------------------------------------------
create table if not exists company_assignment_state (
  company_id uuid primary key references companies (id) on delete cascade,
  last_manager_id uuid references managers (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table company_assignment_state enable row level security;

-- Radius продолжает очередь с того же места.
insert into company_assignment_state (company_id, last_manager_id)
select (select id from companies where login = 'radius_logistics'), s.last_manager_id
from lead_assignment_state s
where s.id = true and (select id from companies where login = 'radius_logistics') is not null
on conflict (company_id) do nothing;

create or replace function assign_next_manager_in(p_company uuid)
returns setof managers
language plpgsql
as $$
declare
  last_id uuid;
  last_order integer;
  chosen managers%rowtype;
begin
  insert into company_assignment_state (company_id) values (p_company) on conflict (company_id) do nothing;

  -- FOR UPDATE: две одновременные заявки не получат одного менеджера.
  select last_manager_id into last_id from company_assignment_state where company_id = p_company for update;
  if last_id is not null then
    select sort_order into last_order from managers where id = last_id and company_id = p_company;
  end if;

  select * into chosen from managers
  where company_id = p_company and is_active and (last_order is null or sort_order > last_order)
  order by sort_order, created_at limit 1;

  if not found then
    select * into chosen from managers
    where company_id = p_company and is_active
    order by sort_order, created_at limit 1;
  end if;

  if not found then
    return; -- нет активных менеджеров: заявка создастся без ответственного
  end if;

  update company_assignment_state set last_manager_id = chosen.id, updated_at = now() where company_id = p_company;
  return next chosen;
end;
$$;

revoke all on function assign_next_manager_in(uuid) from public, anon, authenticated;
grant execute on function assign_next_manager_in(uuid) to service_role;

commit;

-- ---------------------------------------------------------------------
-- ПРОВЕРКА (должно быть 0 во всех трёх строках):
--   select (select count(*) from accounts where company_id is null) as accounts,
--          (select count(*) from managers where company_id is null) as managers,
--          (select count(*) from leads    where company_id is null) as leads;
--   select name, status, trial_ends_at, lead_kind, subdomain, telegram_leads from companies;
-- ---------------------------------------------------------------------
