-- =====================================================================
-- DexaAI: роль «Супер-админ» (admin) — видит все заявки и статистику, больше ничего.
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- Самого супер-админа (имя, логин, пароль) заводит отдельный скрипт вне репозитория.
-- =====================================================================

alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check check (role in ('owner', 'manager', 'admin'));
