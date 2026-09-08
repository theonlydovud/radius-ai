# Radius AI

B2B SaaS-платформа автоматизации консультирования в Instagram Direct и Telegram для **Radius Logistics**. ИИ-консультант (Gemini 2.5 Flash-Lite) ведёт диалог с клиентом, отвечает на вопросы по базе знаний (RAG), собирает данные о грузе и передаёт готовую заявку логисту — сам ИИ цену не называет.

## Стек

- **Next.js 14** (App Router, Route Handlers)
- **Supabase** (PostgreSQL + `pgvector` + Auth-ready клиенты)
- **Google Gemini 2.5 Flash-Lite** (`@google/generative-ai`) + `text-embedding-004` для RAG
- **Tailwind CSS**, **shadcn/ui**-подобные примитивы, **Lucide Icons**
- Шрифт **Geist** (`next/font/google`)

## Архитектура

```
src/
├── app/
│   ├── layout.tsx                     # Geist, глобальные стили
│   ├── page.tsx                       # редирект на /playground
│   ├── (dashboard)/                   # layout с левым сайдбаром
│   │   ├── layout.tsx
│   │   ├── playground/page.tsx        # 1. Диалог с ИИ (песочница)
│   │   ├── knowledge/page.tsx         # 2. Знания ИИ (RAG)
│   │   ├── rules/page.tsx             # 3. Правила общения
│   │   ├── leads/page.tsx             # 4. Заявки
│   │   ├── inbox/page.tsx             # 5. История чатов
│   │   └── accounts/page.tsx          # 6. Аккаунты (интеграции)
│   └── api/
│       ├── chat/route.ts              # песочница: вызов Gemini + защита от 429
│       ├── knowledge/route.ts         # CRUD базы знаний
│       ├── rules/route.ts             # CRUD системных правил
│       ├── leads/route.ts             # список заявок
│       ├── leads/[id]/route.ts        # выставление цены логистом
│       ├── accounts/route.ts          # CRUD подключённых аккаунтов
│       ├── sessions/route.ts          # список диалогов
│       ├── sessions/[id]/route.ts     # перехват диалога менеджером
│       ├── messages/route.ts          # сообщения диалога
│       └── webhooks/
│           ├── telegram/route.ts      # приём сообщений из Telegram Bot API
│           └── instagram/route.ts     # приём сообщений из Instagram Messaging API
├── middleware.ts                      # обновление сессии Supabase Auth (готово к подключению входа для менеджера)
├── components/
│   ├── sidebar.tsx
│   └── ui/                            # button, card, input, textarea, badge,
│                                       # dialog, table, tabs, select, switch, label
├── lib/
│   ├── gemini.ts                      # сборка системного промпта из БД + RAG + вызов Gemini
│   ├── lead-extraction.ts             # эвристическое извлечение полей заявки
│   ├── utils.ts
│   └── supabase/{client,server}.ts
└── types/index.ts
```

### Как работает ИИ-консультант (важно)

В коде **нет захардкоженных системных инструкций**. При каждом запросе `buildSystemInstruction()` в `src/lib/gemini.ts`:

1. Читает активные (`is_active = true`) записи `system_rules`, группирует их по `rule_type` (`tone`, `qualification_requirements`, `general`) и добавляет как секции промпта.
2. Делает RAG-поиск по `knowledge` (через `pgvector`, с фолбэком на текстовый поиск, если эмбеддинг ещё не посчитан) и добавляет релевантные статьи как источник фактов.
3. Собирает финальный `systemInstruction`, который передаётся в Gemini вместе с историей диалога.

Это значит, что весь тон, требования к квалификации лида и база знаний управляются полностью из UI платформы (вкладки «Знания ИИ» и «Правила общения»), без деплоя нового кода.

### Защита от 429 (Rate Limit)

`sendToGemini()` оборачивает вызов Gemini в `try/catch`. При статусе `429` / `RESOURCE_EXHAUSTED` выбрасывается `GeminiRateLimitError`, которую `api/chat/route.ts` и оба вебхука превращают в сообщение:

> «Слишком большая нагрузка на сервера, повторите попытку через 1-2 минуты.»

Система не падает и не отдаёт 500 клиенту.

### Задержка ответа в песочнице

`api/chat/route.ts` держит вызов Gemini и `setTimeout` (2.5–3.0 сек, случайная величина) в одном `Promise.all`, так что общая задержка ответа не превышает время самого долгого из двух, но никогда не бывает короче 2.5 сек. Пока идёт ожидание, фронтенд (`playground/page.tsx`) показывает анимацию «ИИ печатает...» с тремя пульсирующими точками.

## Установка

```bash
npm install
cp .env.example .env.local
# заполните .env.local ключами Supabase и Gemini
npm run dev
```

Откройте `http://localhost:3000` — вас перенаправит на `/playground`.

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-ключ Supabase (клиентские запросы) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role ключ (используется только на сервере, в Route Handlers) |
| `GOOGLE_GEMINI_API_KEY` | ключ Gemini API |
| `TELEGRAM_BOT_TOKEN` | токен бота для вебхука Telegram (опционально) |
| `INSTAGRAM_VERIFY_TOKEN` | произвольная строка для верификации вебхука Meta (опционально) |
| `INSTAGRAM_PAGE_ACCESS_TOKEN` | токен страницы Instagram для отправки сообщений (опционально) |

## Настройка Supabase (SQL)

Выполните целиком в **Supabase → SQL Editor**. Скрипт идемпотентен (`if not exists`) и его можно перезапускать.

```sql
-- =========================================================
-- Radius AI — схема базы данных
-- =========================================================

-- 1. Расширения
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- =========================================================
-- 2. accounts — подключённые аккаунты Instagram / Telegram
-- =========================================================
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('instagram', 'telegram')),
  account_name text not null,
  access_token text not null default '',
  -- Bot Token (Telegram) или Page Access Token (Instagram) хранится здесь,
  -- а не в .env — это позволяет подключать сколько угодно независимых
  -- аккаунтов через UI без передеплоя приложения.
  webhook_verify_token text,
  -- Используется только для Instagram: значение, которое Meta присылает
  -- в hub.verify_token при верификации вебхука (GET-запрос). Задаётся
  -- пользователем при подключении аккаунта и должно совпадать с тем, что
  -- указано в Meta for Developers → Webhooks.
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists idx_accounts_platform on accounts (platform);

-- Миграция для уже существующей базы (если таблица accounts была создана
-- до появления Webhook Verify Token — выполните отдельно):
-- alter table accounts add column if not exists webhook_verify_token text;

-- =========================================================
-- 3. system_rules — правила тона и квалификации лида
-- =========================================================
create table if not exists system_rules (
  id uuid primary key default uuid_generate_v4(),
  rule_type text not null check (rule_type in ('tone', 'qualification_requirements', 'general')),
  title text not null,
  rule_text text not null,
  is_active boolean not null default true
);

create index if not exists idx_system_rules_type on system_rules (rule_type);
create index if not exists idx_system_rules_active on system_rules (is_active);

-- =========================================================
-- 4. knowledge — база знаний RAG (pgvector, 768 измерений —
--    под text-embedding-004)
-- =========================================================
create table if not exists knowledge (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

-- Индекс для приближённого поиска ближайших соседей (косинусное расстояние)
create index if not exists idx_knowledge_embedding
  on knowledge using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC-функция для семантического поиска, вызывается из src/lib/gemini.ts
create or replace function match_knowledge (
  query_embedding vector(768),
  match_count int default 4
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
  order by knowledge.embedding <=> query_embedding
  limit match_count;
$$;

-- =========================================================
-- 5. chat_sessions — сессии диалогов с клиентами
-- =========================================================
create table if not exists chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts (id) on delete cascade,
  client_id text not null,
  client_name text not null default 'Клиент',
  status text not null default 'ai_active'
    check (status in ('ai_active', 'manager_takeover', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_account on chat_sessions (account_id);
create index if not exists idx_chat_sessions_status on chat_sessions (status);
create unique index if not exists idx_chat_sessions_account_client
  on chat_sessions (account_id, client_id)
  where status <> 'closed';

-- =========================================================
-- 6. messages — сообщения внутри сессии
-- =========================================================
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references chat_sessions (id) on delete cascade,
  sender text not null check (sender in ('user', 'ai', 'manager')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_session on messages (session_id, created_at);

-- =========================================================
-- 7. leads — собранные заявки для логиста
-- =========================================================
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references chat_sessions (id) on delete cascade,
  client_name text not null default 'Клиент',
  client_phone text not null default '',
  collected_data jsonb not null default '{}'::jsonb,
  -- collected_data пример: {"origin_city":"Ташкент","destination_city":"Москва","weight":"120 кг","cargo_type":"одежда"}
  quote_price numeric,
  status text not null default 'pending_quote'
    check (status in ('pending_quote', 'quoted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_status on leads (status);
create index if not exists idx_leads_session on leads (session_id);

-- =========================================================
-- 8. Row Level Security
--    Для внутреннего дашборда доступ идёт через service-role ключ на
--    сервере (см. src/lib/supabase/server.ts → createAdminClient),
--    который обходит RLS. Ниже — базовые политики на случай, если
--    вы также подключите Supabase Auth и клиентские запросы напрямую.
-- =========================================================
alter table accounts enable row level security;
alter table system_rules enable row level security;
alter table knowledge enable row level security;
alter table chat_sessions enable row level security;
alter table messages enable row level security;
alter table leads enable row level security;

create policy "authenticated read accounts" on accounts
  for select using (auth.role() = 'authenticated');
create policy "authenticated read system_rules" on system_rules
  for select using (auth.role() = 'authenticated');
create policy "authenticated read knowledge" on knowledge
  for select using (auth.role() = 'authenticated');
create policy "authenticated read chat_sessions" on chat_sessions
  for select using (auth.role() = 'authenticated');
create policy "authenticated read messages" on messages
  for select using (auth.role() = 'authenticated');
create policy "authenticated read leads" on leads
  for select using (auth.role() = 'authenticated');

-- =========================================================
-- 9. Демо-данные (опционально, для быстрого теста песочницы)
-- =========================================================
insert into system_rules (rule_type, title, rule_text, is_active) values
  ('tone', 'Дружелюбный и деловой тон',
   'Общайся вежливо, кратко и по делу, как опытный логист-консультант. Обращайся на «вы». Не используй канцеляризмы.',
   true),
  ('qualification_requirements', 'Обязательные поля заявки',
   'Прежде чем передать заявку логисту, обязательно уточни: город отправления, город назначения, вес или объём груза, тип груза и телефон для связи.',
   true),
  ('general', 'Запрет на самостоятельный расчёт цены',
   'Никогда не называй клиенту цену или примерную стоимость самостоятельно — расчёт всегда делает логист вручную после получения всех данных.',
   true)
on conflict do nothing;

insert into knowledge (title, content) values
  ('Сроки доставки Узбекистан — Россия',
   'Стандартная сборная доставка автотранспортом из Ташкента в города России занимает 7–10 рабочих дней. Экспресс-доставка — 3–5 дней при полной загрузке.'),
  ('Требования к упаковке груза',
   'Груз должен быть упакован в прочную тару, исключающую повреждение при перегрузке. Хрупкие товары маркируются отдельно и требуют дополнительной амортизации.')
on conflict do nothing;
```

### Включение realtime (опционально)

Если хотите, чтобы вкладка «История чатов» обновлялась без перезагрузки страницы, включите репликацию для `messages` и `chat_sessions` в **Supabase → Database → Replication**, и подпишитесь на изменения через `supabase.channel(...)` в `inbox/page.tsx`.

## Заполнение эмбеддингов для существующих статей

Если вы добавили статьи в `knowledge` до включения RAG, посчитайте эмбеддинги отдельным скриптом, вызывающим `text-embedding-004` и сохраняющим результат в колонку `embedding`. `src/lib/gemini.ts` уже поддерживает автоматический подсчёт эмбеддинга для нового запроса пользователя (`embedText`) — тот же подход можно применить к статьям базы знаний через простой Node-скрипт с `@google/generative-ai`.

## Вебхуки — динамические, per-account

Токены (Bot Token / Page Access Token / Webhook Verify Token) хранятся **только** в таблице `accounts` в Supabase — не в `.env`. Каждый подключённый аккаунт получает свой собственный URL вида:

```
POST /api/webhooks/telegram/{accountId}
GET|POST /api/webhooks/instagram/{accountId}
```

`accountId` — это `id` строки в `accounts`. При входящем запросе роут ищет аккаунт в Supabase по этому `id`, берёт его `access_token` (и `webhook_verify_token` для GET-верификации Instagram) и использует их для ответа клиенту. Один и тот же деплой обслуживает сколько угодно ботов и IG-страниц одновременно.

**Как подключить аккаунт:**

1. Вкладка «Аккаунты» → «Подключить аккаунт» → выберите платформу, введите название и токен (для Instagram — ещё и Webhook Verify Token, произвольная строка).
2. На карточке аккаунта нажмите «Скопировать Webhook URL».
3. Telegram: нажмите «Проверить соединение» — платформа сама вызовет `getMe` и `setWebhook` с этим URL, ничего вручную регистрировать не нужно.
   Instagram: вставьте скопированный URL и тот же Webhook Verify Token в Meta for Developers → Webhooks → Instagram, затем нажмите «Проверить соединение», чтобы убедиться, что токен действителен.
4. Статус карточки (Connected / Ошибка соединения) обновляется автоматически по результату проверки.

## Исправление потери контекста диалога (история + системный промпт)

Была проблема: бот забывал ранее сообщённый город после нескольких реплик подряд (например, «мумбайдан» → «тошкенга»). Причина — дублирующийся `user`-ход в конце массива `history`, передаваемого в `startChat()`: клиент одновременно клал текущее сообщение и в `history`, и в отдельный параметр `message`, из-за чего чередование ролей `user`/`model` ломалось.

Исправлено в двух местах:

- **`src/lib/gemini.ts`** — добавлена `normalizeHistory()`: склеивает случайно задублированные соседние ходы одной роли и гарантированно обрезает историю так, чтобы она не заканчивалась на `user` (этот ход и так добавляет `sendMessage()`). Применяется централизованно внутри `sendToGemini()`, поэтому чинит песочницу и оба вебхука сразу.
- **`src/app/(dashboard)/playground/page.tsx`** — история теперь строится из состояния `messages` до добавления текущего сообщения, а не после.
- **Системная инструкция** (`BASE_SYSTEM_INSTRUCTION` в `src/lib/gemini.ts`) переписана: явно требует анализировать всю историю переписки, объясняет узбекские падежные окончания («-дан»/«-dan» = откуда, «-га»/«-ga»/«-ка» = куда) и запрещает придумывать страны/города, которых клиент не называл.

Кнопка «Очистить диалог» в песочнице сбрасывает только локальное состояние `messages` в браузере — она не трогает `chat_sessions`/`messages` в Supabase, так как песочница не создаёт постоянную сессию (это тестовый режим, отдельный от реальных диалогов клиентов во вкладке «История чатов»).

## Проверено перед сдачей

Проект собран и проверен в этой среде перед передачей:

```bash
npm install
npx tsc --noEmit   # 0 ошибок
npx next lint      # 0 предупреждений и ошибок
npx next build     # успешная продакшн-сборка, все 19 маршрутов
```

`src/middleware.ts` уже настроен на обновление сессии Supabase Auth на каждом запросе (кроме статики и `/api/webhooks/*`) — пригодится, если добавите вход для менеджера через Supabase Auth; сама платформа сейчас работает как внутренний дашборд без обязательной авторизации.
