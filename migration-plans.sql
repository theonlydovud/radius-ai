-- =====================================================================
-- DexaAI: тарифы, лимит сообщений, один аккаунт — одно устройство,
-- Radius Academy — отдельная компания.
--
-- Выполнить один раз в Supabase → SQL Editor, целиком, ДО деплоя backend
-- (нужна уже выполненная migration-multitenant.sql). Повторный запуск безопасен:
-- изменённые цены и лимиты тарифов он не затирает.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Тарифы. Цены, лимиты и функции лежат здесь, а не в коде:
--    поменял строку — через минуту изменилось на сайте.
--    features: manual_leads   — ручное создание заявок
--              chat_history   — история чатов и перехват диалога
--              stats          — статистика
--              lead_transfer  — менеджеры и передача заявок
--              assistant      — ИИ-ассистент (текст и голос)
-- ---------------------------------------------------------------------
create table if not exists plans (
  code text primary key,
  name text not null,
  price integer not null,                       -- сум в месяц
  instagram_accounts integer not null default 1,
  users_included integer not null,              -- вместе с владельцем
  extra_user_price integer,                     -- сум за доп. пользователя; null — докупить нельзя
  messages_limit integer not null,              -- ответов бота за период
  features jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0
);
alter table plans enable row level security;

insert into plans (code, name, price, instagram_accounts, users_included, extra_user_price, messages_limit, features, sort_order) values
  ('start',    'Start',    120000, 1, 1, null,  3000,
   '{"manual_leads": false, "chat_history": false, "stats": false, "lead_transfer": false, "assistant": false}', 1),
  ('business', 'Business', 250000, 1, 3, 50000, 6000,
   '{"manual_leads": true,  "chat_history": true,  "stats": true,  "lead_transfer": true,  "assistant": false}', 2),
  ('pro',      'Pro',      400000, 1, 6, 50000, 10000,
   '{"manual_leads": true,  "chat_history": true,  "stats": true,  "lead_transfer": true,  "assistant": true}',  3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. Компании: тариф, период и счётчик сообщений
-- ---------------------------------------------------------------------
alter table companies add column if not exists plan text references plans (code);
-- unlimited — наши компании (Radius Logistics, Radius Academy): без тарифных
-- ограничений, без лимита сообщений и без правила «одно устройство».
alter table companies add column if not exists unlimited boolean not null default false;
alter table companies add column if not exists period_start timestamptz;
alter table companies add column if not exists period_end timestamptz;
alter table companies add column if not exists messages_used integer not null default 0;
alter table companies add column if not exists extra_users integer not null default 0;   -- докупленные пользователи
alter table companies add column if not exists limit_notified_at timestamptz;            -- уведомление «лимит исчерпан» уже отправлено

update companies set unlimited = true, plan = coalesce(plan, 'pro') where login = 'radius_logistics';

-- Кто уже на пробном периоде — пробуют Pro до его конца.
update companies
set plan = 'pro', period_start = coalesce(period_start, created_at), period_end = coalesce(period_end, trial_ends_at)
where plan is null and not unlimited;

-- Один ответ бота = одно сообщение. Атомарно: два ответа одновременно не потеряют счёт.
create or replace function count_company_message(p_company uuid)
returns integer
language sql
as $$
  update companies set messages_used = messages_used + 1 where id = p_company returning messages_used;
$$;
revoke all on function count_company_message(uuid) from public, anon, authenticated;
grant execute on function count_company_message(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3. Один аккаунт — одно устройство: id текущего входа. Новый вход меняет его,
--    и прежнее устройство выходит. У unlimited-компаний не проверяется.
-- ---------------------------------------------------------------------
alter table app_users add column if not exists session_id text;

-- Тариф, выбранный при регистрации (пробный период идёт на нём).
alter table dexa_signups add column if not exists plan text;

-- ---------------------------------------------------------------------
-- 4. Radius Academy — отдельная компания со своим Instagram, знаниями и заявками.
-- ---------------------------------------------------------------------
do $$
declare
  rid uuid;
  aid uuid;
begin
  select id into rid from companies where login = 'radius_logistics';
  select id into aid from companies where name = 'Radius Academy';
  -- Academy уже вынесена (или удалена и заведена заново обычной регистрацией) — ничего не делаем.
  if aid is null and not exists (select 1 from accounts where company_id = rid and account_name ilike '%radius_academy%') then
    return;
  end if;
  if aid is null then
    insert into companies (name, status, lead_kind, unlimited, plan, telegram_leads, profile)
    values ('Radius Academy', 'active', 'generic', true, 'pro', false, '{}'::jsonb)
    returning id into aid;
  end if;

  -- Заявки из диалогов аккаунта Academy (если уже есть) уходят вместе с ним.
  update leads l
  set company_id = aid, manager_id = null
  from chat_sessions s
  join accounts a on a.id = s.account_id
  where s.id = l.session_id and a.company_id = rid and a.account_name ilike '%radius_academy%';

  update accounts set company_id = aid
  where company_id = rid and account_name ilike '%radius_academy%';

  -- Вход в Radius Academy: логин компании radius_academy и руководитель golib_academy.
  -- Пароли — те же, что у Radius Logistics и Голиба (хеши копируются внутри базы).
  if not exists (select 1 from companies where login = 'radius_academy') then
    update companies set login = 'radius_academy', password_hash = (select password_hash from companies where id = rid) where id = aid;
  end if;
  insert into app_users (company_id, name, role, login, password_hash, is_active, sort_order)
  select aid, u.name, 'owner', 'golib_academy', u.password_hash, true, 0
  from app_users u
  where u.login = 'golib_raxmatov' and not exists (select 1 from app_users where login = 'golib_academy');
end $$;

commit;

-- ---------------------------------------------------------------------
-- ПРОВЕРКА:
--   select name, status, plan, unlimited, period_end, messages_used from companies;
--   select account_name, (select name from companies c where c.id = a.company_id) from accounts a;
--   select code, name, price, users_included, messages_limit, features from plans order by sort_order;
--
-- КАК ПОДКЛЮЧИТЬ КОМПАНИЮ ПОСЛЕ ОПЛАТЫ (новый период 30 дней, счётчик с нуля):
--   update companies
--   set status = 'active', plan = 'business',           -- start | business | pro
--       period_start = now(), period_end = now() + interval '30 days',
--       messages_used = 0, limit_notified_at = null
--   where name = 'Название компании';
--
-- Докупили пользователя:   update companies set extra_users = extra_users + 1 where name = '…';
-- Поменять лимит или цену: update plans set messages_limit = 8000 where code = 'business';
-- ---------------------------------------------------------------------
