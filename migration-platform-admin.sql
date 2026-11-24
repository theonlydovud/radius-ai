-- =====================================================================
-- Панель владельца платформы: заморозка, бан, журнал безопасности (24.11.2026)
--
-- companies.blocked: null — работает; frozen — заморожена (бот молчит, кабинет открыт,
--   сверху причина); banned — забанена (вход закрыт всем сотрудникам, бот молчит).
-- security_events — что заметила система: джейлбрейк, запрещённые темы, ответы,
--   заблокированные Gemini, всплески трафика. Видит только владелец платформы.
--
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

alter table companies add column if not exists blocked text;
alter table companies drop constraint if exists companies_blocked_check;
alter table companies add constraint companies_blocked_check check (blocked is null or blocked in ('frozen', 'banned'));
alter table companies add column if not exists blocked_reason text;
alter table companies add column if not exists blocked_at timestamptz;

create table if not exists security_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete cascade,
  account_id uuid,
  session_id uuid,
  -- client — сообщение клиента в Instagram; role — «Роль ИИ» компании; playground — «Диалог с ИИ»;
  -- assistant — ИИ-ассистент; gemini — ответ заблокирован фильтром Gemini; traffic — всплеск
  source text not null,
  -- jailbreak — попытка обойти инструкции бота; illegal — запрещённая тема; blocked_by_ai; spike
  kind text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  excerpt text,
  matched text,
  reviewed boolean not null default false,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists security_events_company_idx on security_events (company_id, created_at desc);
create index if not exists security_events_open_idx on security_events (reviewed, created_at desc);
alter table security_events enable row level security; -- читает только backend (service role)

-- ПРОВЕРКА:
--   select name, blocked, blocked_reason from companies;
--   select source, kind, severity, count(*) from security_events group by 1, 2, 3;
