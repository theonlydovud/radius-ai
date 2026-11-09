-- =====================================================================
-- Radius AI — МИГРАЦИЯ: заявки в Telegram-группу и кнопка «✅ Ishga oldim».
-- Запускать в Supabase → SQL Editor ДО деплоя нового backend. Целиком.
-- Только добавляет поля, ничего не удаляет. Можно запускать повторно.
-- =====================================================================

begin;

-- Telegram ID менеджера: упоминание в сообщении о заявке и право нажать кнопку.
alter table managers add column if not exists telegram_id bigint;
create unique index if not exists idx_managers_telegram_id on managers (telegram_id) where telegram_id is not null;

update managers set telegram_id = 7060366480 where name = 'Жасур' and telegram_id is null;
update managers set telegram_id = 7912946667 where name = 'Хуршид' and telegram_id is null;

-- Кто и когда нажал «✅ Ishga oldim».
alter table leads add column if not exists taken_by text;
alter table leads add column if not exists taken_by_telegram_id bigint;
alter table leads add column if not exists taken_at timestamptz;

-- Куда ушло сообщение о заявке: [{ "chat_id": ..., "message_id": ... }],
-- чтобы после нажатия кнопки обновить все копии.
alter table leads add column if not exists telegram_messages jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

commit;

-- ПРОВЕРКА:
--   select name, telegram_id from managers order by sort_order;
