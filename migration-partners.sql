-- =====================================================================
-- Лид «Водитель» / модуль «Партнёры» (ТЗ 23.11.2026)
--
-- leads.kind: client — заявка клиента (воронка, статистика, напоминания);
--             partner — партнёр, например водитель, который ищет груз для своей машины:
--             без ответственного, вне воронки и статистики, своя вкладка «Водители».
-- Данные партнёра лежат в collected_data: partner_offer (машина), partner_directions (направления).
--
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

alter table leads add column if not exists kind text not null default 'client';
alter table leads drop constraint if exists leads_kind_check;
alter table leads add constraint leads_kind_check check (kind in ('client', 'partner'));
create index if not exists leads_company_kind_idx on leads (company_id, kind, created_at desc);

-- Radius Logistics: принимать водителей, тип называется «Водитель».
update companies
set settings = jsonb_set(
      coalesce(settings, '{}'::jsonb) || jsonb_build_object('partners', jsonb_build_object('label', 'Водитель', 'label_many', 'Водители')),
      '{modules,partners}', 'true'::jsonb, true
    )
where name = 'Radius Logistics';

-- ПРОВЕРКА:
--   select name, settings -> 'modules' as modules, settings -> 'partners' as partners from companies where name = 'Radius Logistics';
--   select kind, count(*) from leads group by kind;
