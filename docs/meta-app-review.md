# Проверка приложения в Meta (App Review) — DexaAI

Цель: перевести приложение в режим **Live**, чтобы любой клиент подключал Instagram одной кнопкой,
без добавления в тестировщики.

Приложение: developers.facebook.com → «Мои приложения» → приложение DexaAI (ID 2547673968974748).

---

## 1. Подготовка (до отправки)

### 1.1 Подтверждение компании (Business verification)
Без него Advanced Access не дадут.

1. business.facebook.com → **Настройки компании** → **Центр безопасности** → **Подтвердить компанию**.
2. Понадобятся:
   - свидетельство о регистрации (ИП или ООО);
   - адрес;
   - телефон;
   - сайт **https://dexa.uz**.
3. Название и адрес в документах должны совпадать с тем, что вводишь в форму.
4. Приложение должно быть привязано к этому бизнес-аккаунту: **Настройки приложения → Основное → Бизнес-аккаунт**.

### 1.2 Настройки приложения → Основное (App settings → Basic)

| Поле | Значение |
|---|---|
| Отображаемое название | DexaAI |
| Значок приложения (1024×1024) | `brand/dexaai-app-icon-1024.png` |
| URL политики конфиденциальности | https://dexa.uz/privacy |
| URL условий использования | https://dexa.uz/privacy (своей страницы условий пока нет) |
| Удаление данных пользователя → «URL обратного вызова для удаления данных» | https://radius-ai-rxwu.onrender.com/api/instagram/data-deletion |
| Категория | Бизнес и страницы (Business and Pages) |
| Эл. почта для связи | твоя рабочая почта |
| Домены приложения | dexa.uz |

### 1.3 Instagram → API setup with Instagram business login → Business login settings

| Поле | Значение |
|---|---|
| OAuth redirect URIs | `https://dexa.uz/api/auth/instagram/callback` (старый адрес onrender можно оставить) |
| Deauthorize callback URL | https://radius-ai-rxwu.onrender.com/api/instagram/deauthorize |
| Data deletion request URL | https://radius-ai-rxwu.onrender.com/api/instagram/data-deletion |

### 1.4 Какие разрешения запрашивать
Только то, чем DexaAI реально пользуется. Лишние разрешения — частая причина отказа.

- `instagram_business_basic` — **Advanced Access**
- `instagram_business_manage_messages` — **Advanced Access**

`instagram_business_manage_comments` **не запрашивать**: комментарии DexaAI не обрабатывает.

---

## 2. Тексты для заявки (на английском — вставлять как есть)

### instagram_business_basic — How will your app use this permission?

> DexaAI is a SaaS tool for small businesses that sell through Instagram Direct. A business owner logs in to
> DexaAI (dexa.uz) and connects their Instagram professional account with Instagram Login. We use
> instagram_business_basic to read the connected account's ID and username, so we can show which account is
> connected in the dashboard, match incoming Direct messages (webhooks) to the right business, and keep each
> business's data separate. We do not access the account's media, followers or any other content.

### instagram_business_manage_messages — How will your app use this permission?

> DexaAI answers customers who write to the business's Instagram Direct. When a customer sends a message, we
> receive it through the messages webhook, generate a reply based on the knowledge base and rules the business
> wrote in DexaAI, and send the reply on behalf of the business with the Instagram Messaging API within the
> 24-hour messaging window. When the customer shares what they need and a phone number, DexaAI creates a lead and
> shows it, with the conversation, to the business's staff in a simple CRM. Staff can take over a conversation,
> after which the bot stops replying in that chat. We never send messages to people who did not write to the
> business first, and we do not send promotional or bulk messages.

### Пошаговая инструкция для проверяющего (Step-by-step instructions / Test credentials)

> 1. Open https://dexa.uz/login and sign in with the test account (login and password are in the
>    "Test credentials" field). The interface can be switched to English with the language button (RU → EN).
> 2. Go to Settings → Instagram accounts → "Connect Instagram" and sign in with an Instagram professional
>    account. After returning to DexaAI the account appears as "Connected".
> 3. Fill a short knowledge entry in "AI knowledge" (for example: "We sell sofas, delivery in Tashkent is free")
>    or keep the default behaviour.
> 4. From another Instagram account, send a Direct message to the connected account, e.g. "Hi, how much is a
>    corner sofa? My phone is +998901234567".
> 5. Within about 20–60 seconds the AI replies in the same chat, in the customer's language.
> 6. In DexaAI open "Leads": a new lead with the customer's request and phone number appears. "Chat history"
>    shows the full conversation; "Take over" stops the bot for that chat.

Логин и пароль тестового аккаунта в репозиторий не кладём: они у владельца (переданы в чате),
вписываются в поле «Test credentials» прямо в форме Meta.

---

## 3. Видео (screencast)

Meta требует запись экрана с полным путём. Длина 2–4 минуты, без звука можно. Интерфейс переключить на **EN**
(кнопка языка в меню).

1. Открыть https://dexa.uz → «Войти» → войти тестовым аккаунтом.
2. Настройки → Instagram-аккаунты → **Connect Instagram**: показать окно Instagram со списком разрешений
   (`instagram_business_basic`, `instagram_business_manage_messages`) и нажать «Разрешить».
3. Вернуться в DexaAI: аккаунт в статусе **Connected**.
4. Знания ИИ: показать, что бизнес сам пишет, что рассказывать клиентам.
5. С телефона другого аккаунта написать в Direct подключённому аккаунту вопрос и номер телефона.
6. Показать ответ бота в Instagram (экран телефона или веб-версия Instagram).
7. В DexaAI: «Заявки» — появилась заявка; «История чатов» — переписка; нажать «Перехватить диалог».
8. Показать удаление данных: Instagram → Настройки → Сайты и приложения → DexaAI → Удалить (или кнопка
   удаления аккаунта в DexaAI).

---

## 4. После отправки

- Ответ обычно приходит от нескольких дней до двух недель. Если Meta отклонит, в письме будет причина.
  Пришли её — исправим и отправим повторно.
- После одобрения: **App Mode → Live** (переключатель вверху страницы приложения).
- Проверить: подключить Instagram аккаунта, которого нет в тестировщиках. Должно пройти с первого раза.
