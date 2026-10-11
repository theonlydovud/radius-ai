-- =====================================================================
-- Radius AI — МИГРАЦИЯ: мультиаккаунтинг (знания и правила по аккаунтам)
-- Запускать в Supabase → SQL Editor. Целиком, одним запуском.
--
-- Безопасность:
--   * НИ ОДНОГО DROP TABLE / TRUNCATE / DELETE по данным.
--   * Скрипт идемпотентен: повторный запуск ничего не ломает.
--   * Всё выполняется в одной транзакции: при ошибке откатится целиком.
--
-- ВАЖНО: роль «бота/аккаунта» в проекте уже выполняет таблица `accounts`
-- (session string MTProto лежит в accounts.access_token, api_id/api_hash/
-- phone — в JSON в accounts.webhook_verify_token, на неё уже ссылаются
-- chat_sessions → messages → leads). Поэтому новую таблицу telegram_accounts
-- НЕ создаём (это дубль и потеря связей с историей чатов), а привязываем
-- знания и правила к accounts.id через новую колонку account_id.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Колонка account_id (пока NULL-able, чтобы не упасть на старых строках)
-- ---------------------------------------------------------------------
alter table knowledge    add column if not exists account_id uuid;
alter table system_rules add column if not exists account_id uuid;

-- ---------------------------------------------------------------------
-- 2. Привязка существующих данных к ПЕРВОМУ аккаунту.
--    Первый = самый старый Telegram-аккаунт; если Telegram-аккаунтов нет —
--    самый старый аккаунт любой платформы.
-- ---------------------------------------------------------------------
do $$
declare
  first_account uuid;
  orphan_count  int;
begin
  select id into first_account
  from accounts
  order by (platform = 'telegram') desc, created_at asc
  limit 1;

  if first_account is null then
    raise notice 'Таблица accounts пуста — привязывать некуда. Строки knowledge/system_rules останутся с account_id = NULL. Подключите аккаунт и запустите скрипт ещё раз.';
  else
    update knowledge    set account_id = first_account where account_id is null;
    update system_rules set account_id = first_account where account_id is null;
    raise notice 'Существующие знания и правила привязаны к аккаунту %', first_account;
  end if;

  select (select count(*) from knowledge    where account_id is null)
       + (select count(*) from system_rules where account_id is null)
    into orphan_count;

  -- NOT NULL включаем только если «сирот» не осталось.
  if orphan_count = 0 then
    alter table knowledge    alter column account_id set not null;
    alter table system_rules alter column account_id set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. FOREIGN KEY ... ON DELETE CASCADE (добавляем, только если ещё нет)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'knowledge_account_id_fkey') then
    alter table knowledge
      add constraint knowledge_account_id_fkey
      foreign key (account_id) references accounts (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'system_rules_account_id_fkey') then
    alter table system_rules
      add constraint system_rules_account_id_fkey
      foreign key (account_id) references accounts (id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Индексы под фильтрацию «по аккаунту»
-- ---------------------------------------------------------------------
create index if not exists idx_knowledge_account    on knowledge (account_id);
create index if not exists idx_system_rules_account on system_rules (account_id, is_active);

-- ---------------------------------------------------------------------
-- 5. RPC для RAG: добавляем фильтр по аккаунту.
--    Удаляем ТОЛЬКО старую функцию (не данные), иначе в Postgres останутся
--    две перегрузки и PostgREST будет отдавать «ambiguous function».
-- ---------------------------------------------------------------------
drop function if exists match_knowledge (vector, int);

create or replace function match_knowledge (
  query_embedding vector(768),
  match_count int default 4,
  filter_account_id uuid default null
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    knowledge.id,
    knowledge.title,
    knowledge.content,
    1 - (knowledge.embedding <=> query_embedding) as similarity
  from knowledge
  where knowledge.embedding is not null
    and (filter_account_id is null or knowledge.account_id = filter_account_id)
  order by knowledge.embedding <=> query_embedding
  limit match_count;
$$;

commit;

-- ---------------------------------------------------------------------
-- ПРОВЕРКА (выполните отдельно после миграции):
--
--   select a.account_name, a.platform,
--          (select count(*) from knowledge    k where k.account_id = a.id) as knowledge_cnt,
--          (select count(*) from system_rules r where r.account_id = a.id) as rules_cnt
--   from accounts a order by a.created_at;
--
--   select count(*) from knowledge    where account_id is null;  -- ожидается 0
--   select count(*) from system_rules where account_id is null;  -- ожидается 0
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- ОПЦИОНАЛЬНО: скопировать знания и правила первого аккаунта во второй
-- (чтобы новый бот не начинал с пустой базы). Подставьте UUID аккаунтов
-- из `select id, account_name from accounts;` и раскомментируйте:
--
--   insert into knowledge (title, content, account_id)
--     select title, content, '<NEW_ACCOUNT_UUID>' from knowledge
--     where account_id = '<FIRST_ACCOUNT_UUID>';
--   insert into system_rules (rule_type, title, rule_text, is_active, account_id)
--     select rule_type, title, rule_text, is_active, '<NEW_ACCOUNT_UUID>' from system_rules
--     where account_id = '<FIRST_ACCOUNT_UUID>';
-- (эмбеддинги при копировании не переносятся — они и так считаются заново)
-- ---------------------------------------------------------------------
