-- =====================================================================
-- Шаблоны бизнеса и настраиваемая воронка (ТЗ «Универсальная платформа», 23.11.2026)
--
-- Этапы остаются прежними кодами статусов (new, in_progress, offered, sold, not_sold) —
-- шаблон в companies.settings решает, какие из них есть у компании и как называются.
-- Поэтому заявки не переносятся: Radius и Академия видят все свои заявки как раньше.
--
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- 1. Причины отказа: у каждой компании свой список (в т.ч. свои причины «custom:…»),
--    проверка — в коде по списку компании, а не жёстким CHECK в базе.
alter table leads drop constraint if exists leads_lost_reason_check;

-- 2. Radius Logistics → шаблон «B2B с расчётом». Названия блока сделки, сроки и рабочее время
--    остаются как были; контроль сроков включён явно (раньше он работал без переключателя).
update companies
set settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
       'template', 'b2b',
       'modules', jsonb_build_object('deadlines', true, 'partners', false)
     )
where name = 'Radius Logistics'
  and coalesce(settings ->> 'template', '') = '';

-- 3. Radius Academy → шаблон «Курсы»: Новый → Консультация → Продано / Не продано, без ставок.
--    Статусы заявок менять не нужно: «Новая» становится «Новый», «В работе» — «Консультация».
update companies
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('template', 'courses')
where name = 'Radius Academy'
  and coalesce(settings ->> 'template', '') = '';

-- ПРОВЕРКА:
--   select name, settings ->> 'template' as template, settings -> 'modules' as modules from companies order by name;
