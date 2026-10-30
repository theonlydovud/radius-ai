-- =====================================================================
-- Radius AI — МИГРАЦИЯ: статусы заявок, менеджеры, закрытие заявок.
-- Запускать в Supabase → SQL Editor ДО деплоя нового backend. Целиком.
--
-- Безопасность:
--   * Заявки не удаляются. Цена (quote_price) остаётся в базе, просто больше
--     не показывается и не меняется.
--   * Всё в одной транзакции: при ошибке откатится целиком.
--   * Можно запускать повторно.
--   * Старый backend продолжит работать: триггер ниже превращает его статус
--     'pending_quote' в 'new', поэтому заявки клиентов не потеряются, пока
--     новая версия ещё не задеплоена.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Менеджеры. Редактируются в «Настройках». Менеджера не удаляют, а
--    отключают (is_active = false), чтобы не терять его статистику.
-- ---------------------------------------------------------------------
create table if not exists managers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_managers_name_unique on managers (lower(name));
alter table managers enable row level security;

-- Только при первом запуске: повторный не вернёт переименованных менеджеров.
insert into managers (name, sort_order)
select v.name, v.sort_order
from (values ('Хуршид', 1), ('Жасур', 2)) as v (name, sort_order)
where not exists (select 1 from managers);

-- ---------------------------------------------------------------------
-- 2. Очередь (round-robin): последний назначенный менеджер хранится в БД,
--    а не в памяти сервера, поэтому перезапуск Render её не сбрасывает.
-- ---------------------------------------------------------------------
create table if not exists lead_assignment_state (
  id boolean primary key default true check (id),
  last_manager_id uuid references managers (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table lead_assignment_state enable row level security;
insert into lead_assignment_state (id) values (true) on conflict (id) do nothing;

-- FOR UPDATE: две заявки, созданные одновременно, не получат одного менеджера.
create or replace function assign_next_manager()
returns setof managers
language plpgsql
as $$
declare
  last_id uuid;
  last_order integer;
  chosen managers%rowtype;
begin
  select last_manager_id into last_id
  from lead_assignment_state
  where id = true
  for update;

  if last_id is not null then
    select sort_order into last_order from managers where id = last_id;
  end if;

  -- Следующий активный по порядку...
  select * into chosen
  from managers
  where is_active and (last_order is null or sort_order > last_order)
  order by sort_order, created_at
  limit 1;

  -- ...а если список кончился — снова с начала.
  if not found then
    select * into chosen
    from managers
    where is_active
    order by sort_order, created_at
    limit 1;
  end if;

  if not found then
    return; -- нет активных менеджеров: заявка создастся без ответственного
  end if;

  update lead_assignment_state
  set last_manager_id = chosen.id, updated_at = now()
  where id = true;

  return next chosen;
end;
$$;

revoke all on function assign_next_manager() from public, anon, authenticated;
grant execute on function assign_next_manager() to service_role;

-- ---------------------------------------------------------------------
-- 3. Новые поля заявки
-- ---------------------------------------------------------------------
alter table leads add column if not exists manager_id uuid references managers (id) on delete set null;
alter table leads add column if not exists closed_at timestamptz;
alter table leads add column if not exists closed_by text;
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists lost_comment text;

-- ---------------------------------------------------------------------
-- 4. Статусы: Новая → В работе → Продано / Не продано.
--    Всем старым заявкам ставим «Новая».
-- ---------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table leads drop constraint %I', c.conname);
  end loop;
end $$;

alter table leads drop constraint if exists leads_lost_reason_check;

update leads
set status = 'new'
where status not in ('new', 'in_progress', 'sold', 'not_sold');

alter table leads alter column status set default 'new';

alter table leads
  add constraint leads_status_check
  check (status in ('new', 'in_progress', 'sold', 'not_sold'));

alter table leads
  add constraint leads_lost_reason_check
  check (
    lost_reason is null
    or lost_reason in (
      'too_expensive', 'closed_themselves', 'nothing_to_offer',
      'not_relevant', 'no_response', 'duplicate_spam'
    )
  );

-- «Не продано» без причины база не примет.
alter table leads
  add constraint leads_not_sold_reason_required
  check (status <> 'not_sold' or lost_reason is not null);

-- Страховка на время выкладки: старый backend пишет 'pending_quote'/'quoted'.
create or replace function leads_map_legacy_status()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('pending_quote', 'quoted', 'closed') then
    new.status := 'new';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_legacy_status on leads;
create trigger trg_leads_legacy_status
  before insert or update of status on leads
  for each row execute function leads_map_legacy_status();

-- ---------------------------------------------------------------------
-- 5. Индексы под фильтры и статистику
-- ---------------------------------------------------------------------
create index if not exists idx_leads_manager on leads (manager_id);
create index if not exists idx_leads_created_at on leads (created_at desc);

-- PostgREST должен сразу увидеть новые таблицы, поля и функцию.
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------
-- ПРОВЕРКА (выполните отдельно после миграции):
--
--   select status, count(*) from leads group by status;   -- ожидается только 'new'
--   select name, is_active, sort_order from managers order by sort_order;
--   select * from lead_assignment_state;
--
-- После деплоя новой версии триггер больше не нужен, его можно убрать:
--   drop trigger if exists trg_leads_legacy_status on leads;
--   drop function if exists leads_map_legacy_status();
-- ---------------------------------------------------------------------
