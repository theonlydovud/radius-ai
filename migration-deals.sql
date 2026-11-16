-- =====================================================================
-- DexaAI: контроль работы с заявками (ТЗ от 16.11.2026).
--   * этап «Ставка предложена» (offered) между «В работе» и закрытием;
--   * блок сделки: вид, ставка клиенту, ставка перевозчика, валюта (маржа считается);
--   * время каждой смены статуса (журнал + поля на заявке);
--   * причины отказа: добавлены недостающие, для «Дорого» — цена клиента/конкурента;
--   * «Следующий контакт»;
--   * напоминания логистам в Telegram (журнал отправленных — без повторов);
--   * настройки компании: блок сделки, сроки, рабочее время.
--
-- Выполнить один раз в Supabase → SQL Editor, целиком, ДО деплоя backend.
-- Повторный запуск безопасен.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Статус «Ставка предложена»
-- ---------------------------------------------------------------------
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check check (status in ('new', 'in_progress', 'offered', 'sold', 'not_sold'));

-- ---------------------------------------------------------------------
-- 2. Поля заявки
-- ---------------------------------------------------------------------
alter table leads add column if not exists assigned_at timestamptz;          -- назначен ответственный
alter table leads add column if not exists offered_at timestamptz;           -- предложена ставка
alter table leads add column if not exists status_changed_at timestamptz;    -- последняя смена статуса
alter table leads add column if not exists deal_type text;                   -- вид перевозки / сделки
alter table leads add column if not exists deal_price numeric;               -- ставка клиенту (сумма сделки)
alter table leads add column if not exists deal_cost numeric;                -- ставка перевозчика (себестоимость)
alter table leads add column if not exists deal_currency text;               -- USD / UZS / EUR / RUB
alter table leads add column if not exists lost_price numeric;               -- «Дорого»: цена, которую хотел клиент / цена конкурента
alter table leads add column if not exists lost_currency text;
alter table leads add column if not exists next_contact_date date;           -- «Следующий контакт»
alter table leads add column if not exists next_contact_note text;

alter table leads drop constraint if exists leads_deal_currency_check;
alter table leads add constraint leads_deal_currency_check check (deal_currency is null or deal_currency in ('USD', 'UZS', 'EUR', 'RUB'));
alter table leads drop constraint if exists leads_lost_currency_check;
alter table leads add constraint leads_lost_currency_check check (lost_currency is null or lost_currency in ('USD', 'UZS', 'EUR', 'RUB'));

-- Существующие заявки: время назначения и последней смены статуса — по тому, что известно.
update leads set assigned_at = created_at where assigned_at is null and manager_id is not null;
update leads set status_changed_at = coalesce(closed_at, taken_at, created_at) where status_changed_at is null;
alter table leads alter column status_changed_at set default now();

-- Причины отказа: прежние остаются, добавлены недостающие.
alter table leads drop constraint if exists leads_lost_reason_check;
alter table leads add constraint leads_lost_reason_check check (
  lost_reason is null or lost_reason in (
    'too_expensive', 'no_response', 'just_asking', 'nothing_to_offer', 'bad_timing', 'chose_other', 'other',
    'closed_themselves', 'not_relevant', 'duplicate_spam'
  )
);

-- ---------------------------------------------------------------------
-- 3. Журнал смен статуса (для статистики и напоминаний; в интерфейсе не показывается)
-- ---------------------------------------------------------------------
create table if not exists lead_status_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  status text not null,
  changed_by text,
  changed_at timestamptz not null default now()
);
create index if not exists idx_lead_status_log_lead on lead_status_log (lead_id, changed_at);
alter table lead_status_log enable row level security;

-- ---------------------------------------------------------------------
-- 4. Напоминания: что уже отправлено (одно и то же не уходит дважды)
-- ---------------------------------------------------------------------
create table if not exists lead_reminders (
  lead_id uuid not null references leads (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (lead_id, key)
);
alter table lead_reminders enable row level security;

-- Без лавины в группе при первом запуске: по заявкам, которые уже висят в работе,
-- эскалация в Telegram-группу считается отправленной. Метки «Нет ставки» / «Зависла»,
-- фильтр «Просроченные» и личные напоминания логистам по ним работают как обычно.
-- (Чтобы всё-таки получить эти сообщения в группу: delete from lead_reminders where key like 'esc_%';)
insert into lead_reminders (lead_id, key)
select id, 'esc_no_offer:' || (to_json(coalesce(taken_at, status_changed_at)) #>> '{}')
from leads where status = 'in_progress' and coalesce(taken_at, status_changed_at) is not null
on conflict do nothing;
insert into lead_reminders (lead_id, key)
select id, 'esc_stuck:' || (to_json(status_changed_at) #>> '{}')
from leads where status in ('in_progress', 'offered') and status_changed_at is not null
on conflict do nothing;

-- Привязка личного Telegram сотрудника: одноразовый код для /start в боте DexaAI.
create table if not exists telegram_links (
  nonce text primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table telegram_links enable row level security;

-- ---------------------------------------------------------------------
-- 5. Настройки компании и тарифы
-- ---------------------------------------------------------------------
alter table companies add column if not exists settings jsonb not null default '{}'::jsonb;

-- Блок сделки — на Business и Pro.
update plans set features = features || '{"deal": true}'::jsonb where code in ('business', 'pro');
update plans set features = features || '{"deal": false}'::jsonb where code = 'start';

-- Radius: блок сделки включён, поля и виды перевозки — логистические, рабочее время пн–пт 9–18.
update companies
set settings = settings || jsonb_build_object(
  'deal', jsonb_build_object(
    'enabled', true,
    'type_label', 'Вид перевозки',
    'price_label', 'Ставка клиенту',
    'cost_label', 'Ставка перевозчика',
    'types', jsonb_build_array('FTL', 'LTL', 'FCL', 'LCL', 'Авиа', 'ЖД', 'Другое'),
    'stage_label', 'Ставка предложена',
    'offer_button', 'Предложил ставку'
  ),
  'deadlines', jsonb_build_object('not_taken_minutes', 30, 'no_offer_hours', 24, 'stuck_days', 3),
  'work', jsonb_build_object('days', jsonb_build_array(1, 2, 3, 4, 5), 'start', '09:00', 'end', '18:00')
)
where login = 'radius_logistics' and not (settings ? 'deal');

commit;

-- ПРОВЕРКА:
--   select status, count(*) from leads group by status;
--   select name, settings from companies;
--   select code, features from plans order by sort_order;
