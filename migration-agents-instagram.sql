-- =====================================================================
-- Radius AI — МИГРАЦИЯ: общие знания для нескольких аккаунтов («агенты»)
-- и подключение Instagram через Instagram Login.
-- Запускать в Supabase → SQL Editor ДО деплоя нового backend.
-- Идемпотентно, без удаления данных, в одной транзакции.
-- =====================================================================

begin;

-- 1. ID аккаунта Instagram, который Meta присылает в вебхуках (entry.id).
--    По нему общий вебхук /api/webhooks/instagram находит нужный аккаунт.
alter table accounts add column if not exists platform_account_id text;
create index if not exists idx_accounts_platform_account on accounts (platform, platform_account_id);

-- 2. «Агент»: аккаунт с knowledge_source_id берёт знания и правила у
--    аккаунта-агента. NULL = у аккаунта свои знания (он сам агент).
alter table accounts add column if not exists knowledge_source_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_knowledge_source_id_fkey') then
    alter table accounts
      add constraint accounts_knowledge_source_id_fkey
      foreign key (knowledge_source_id) references accounts (id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'accounts_knowledge_source_not_self') then
    alter table accounts
      add constraint accounts_knowledge_source_not_self
      check (knowledge_source_id is null or knowledge_source_id <> id);
  end if;
end $$;

create index if not exists idx_accounts_knowledge_source on accounts (knowledge_source_id);

commit;

-- ---------------------------------------------------------------------
-- ПРОВЕРКА:
--   select a.account_name, a.platform, a.platform_account_id,
--          s.account_name as agent
--   from accounts a left join accounts s on s.id = a.knowledge_source_id
--   order by a.created_at;
--
-- Если раньше знания копировались во второй аккаунт вручную, после привязки
-- его к агенту дубли можно удалить (они больше не используются):
--   delete from knowledge    where account_id = '<ID_ПОДКЛЮЧЁННОГО_АККАУНТА>';
--   delete from system_rules where account_id = '<ID_ПОДКЛЮЧЁННОГО_АККАУНТА>';
-- ---------------------------------------------------------------------
