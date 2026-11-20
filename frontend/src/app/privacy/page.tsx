import type { Metadata } from "next";
import Link from "next/link";
import { DexaLogo } from "@/components/brand/dexa-logo";

/**
 * Политика конфиденциальности DexaAI — публичная страница для Meta for Developers:
 *   Privacy Policy URL                 → https://dexa.uz/privacy
 *   Data deletion instructions URL     → https://dexa.uz/privacy#data-deletion
 * Сюда же ведёт ссылка статуса удаления из колбэка data-deletion: /privacy?deletion=<код>.
 * Русская версия и полная английская (её читают проверяющие Meta).
 */

export const metadata: Metadata = {
  title: "Политика конфиденциальности — DexaAI",
  description: "Как DexaAI обрабатывает данные компаний и их клиентов из Instagram Direct. Privacy Policy of DexaAI.",
};

const UPDATED = "20.11.2026";
const BOT = "https://t.me/dexaai_bot";

function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-8 scroll-mt-6 text-base font-semibold text-slate-900">
      {children}
    </h2>
  );
}

export default function PrivacyPage({ searchParams }: { searchParams: { deletion?: string } }) {
  const code = typeof searchParams?.deletion === "string" && /^[a-f0-9]{6,32}$/i.test(searchParams.deletion) ? searchParams.deletion : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-5 py-10 text-sm leading-relaxed text-slate-700 sm:px-6">
        <Link href="/" aria-label="DexaAI">
          <DexaLogo size={26} />
        </Link>

        {code && (
          <div id="deletion-status" className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            <p className="font-semibold">Запрос на удаление данных выполнен · Data deletion request completed</p>
            <p className="mt-1">
              Код подтверждения / Confirmation code: <code className="font-mono font-semibold">{code}</code>
            </p>
            <p className="mt-1 text-xs">
              Токен доступа, переписка и диалоги этого Instagram-аккаунта удалены из DexaAI. The access token, messages and conversations of this
              Instagram account were deleted from DexaAI.
            </p>
          </div>
        )}

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">Политика конфиденциальности</h1>
        <p className="mt-1 text-slate-400">DexaAI · dexa.uz · обновлено {UPDATED}</p>
        <p className="mt-3">
          <a href="#english" className="text-brand hover:underline">
            English version below ↓
          </a>
        </p>

        <H2>Кто мы</H2>
        <p>
          DexaAI (dexa.uz) — сервис для компаний: ИИ-менеджер отвечает клиентам компании в Instagram Direct, собирает заявки и
          показывает их сотрудникам компании в простой CRM. DexaAI работает по поручению компании, которая подключила свой
          Instagram-аккаунт («компания»). Связь с нами — через Telegram-бот{" "}
          <a href={BOT} className="text-brand hover:underline">
            @dexaai_bot
          </a>
          .
        </p>

        <H2>Какие данные мы обрабатываем</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <b>Данные компании и её сотрудников:</b> название компании, контакты из анкеты, имена и логины сотрудников, Telegram ID для
            уведомлений.
          </li>
          <li>
            <b>Данные Instagram-аккаунта компании</b> (через Instagram API с входом через Instagram): имя пользователя и ID
            профессионального аккаунта, токен доступа.
          </li>
          <li>
            <b>Сообщения в Instagram Direct компании:</b> текст сообщений клиентов и ответов, ID отправителя в Instagram, имя или имя
            пользователя из профиля, время сообщений.
          </li>
          <li>
            <b>Данные заявки,</b> которые клиент сам сообщает в переписке: что ему нужно (например, маршрут и груз), номер телефона.
          </li>
        </ul>

        <H2>Зачем</H2>
        <p>
          Только чтобы отвечать клиентам компании от её имени, создавать заявки, показывать переписку и заявки сотрудникам компании,
          считать статистику и отправлять сотрудникам уведомления о заявках. Мы не продаём данные, не используем их для рекламы и не
          передаём другим компаниям. Данные одной компании не видят другие компании.
        </p>

        <H2>Кто ещё обрабатывает данные</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Supabase — хранение базы данных;</li>
          <li>Google (Gemini API) — формирование ответов по тексту сообщений;</li>
          <li>Render и Vercel — работа серверов и сайта;</li>
          <li>Telegram — уведомления сотрудникам компании о заявках.</li>
        </ul>

        <H2>Хранение и защита</H2>
        <p>
          Данные хранятся, пока компания пользуется DexaAI. Соединения защищены HTTPS, токены доступа хранятся только на сервере, доступ
          к данным компании есть только у её сотрудников по личному входу. Когда компания отключает Instagram, токен доступа удаляется.
        </p>

        <H2 id="data-deletion">Удаление данных</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <b>Компания</b> может отключить Instagram в DexaAI: «Настройки» → «Instagram-аккаунты» → удалить аккаунт. Также можно убрать
            DexaAI в Instagram: Настройки → «Сайты и приложения» → удалить приложение. Тогда Meta присылает нам запрос на удаление, мы
            удаляем токен, переписку и диалоги этого аккаунта и выдаём код подтверждения.
          </li>
          <li>
            <b>Клиент компании,</b> который писал ей в Instagram, может попросить удалить свои данные у компании или у нас: напишите{" "}
            <a href={BOT} className="text-brand hover:underline">
              @dexaai_bot
            </a>{" "}
            «Удалить мои данные» и укажите имя пользователя Instagram и компанию. Мы удалим переписку и заявки в течение 30 дней.
          </li>
        </ul>

        <hr className="my-10 border-slate-200" />

        <h1 id="english" className="scroll-mt-6 text-2xl font-semibold tracking-tight text-slate-900">
          Privacy Policy
        </h1>
        <p className="mt-1 text-slate-400">DexaAI · dexa.uz · last updated {UPDATED}</p>

        <H2>Who we are</H2>
        <p>
          DexaAI (dexa.uz) is a service for businesses: an AI assistant replies to a business&apos;s customers in Instagram Direct, collects
          their requests (leads) and shows them to the business&apos;s staff in a simple CRM. DexaAI processes data on behalf of the business
          that connected its Instagram professional account (the &quot;Business&quot;). Contact us via our Telegram bot{" "}
          <a href={BOT} className="text-brand hover:underline">
            @dexaai_bot
          </a>
          .
        </p>

        <H2>Data we process</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <b>Business and staff data:</b> company name, contact details from the company profile, staff names and logins, Telegram IDs
            for notifications.
          </li>
          <li>
            <b>The Business&apos;s Instagram account</b> (Instagram API with Instagram Login): username and ID of the professional account and
            its access token.
          </li>
          <li>
            <b>Instagram Direct messages of the Business:</b> text of customer messages and replies, the sender&apos;s Instagram-scoped ID,
            profile name or username, message timestamps.
          </li>
          <li>
            <b>Lead details</b> the customer provides in the conversation, such as what they need and a phone number.
          </li>
        </ul>

        <H2>Why we use it</H2>
        <p>
          Only to reply to the Business&apos;s customers on its behalf, create leads, show conversations and leads to the Business&apos;s staff,
          calculate statistics and notify staff about new leads. We do not sell data, use it for advertising or share it with other
          companies. One Business never sees another Business&apos;s data.
        </p>

        <H2>Service providers</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Supabase — database hosting;</li>
          <li>Google (Gemini API) — generating replies from message text;</li>
          <li>Render and Vercel — server and website hosting;</li>
          <li>Telegram — lead notifications to the Business&apos;s staff.</li>
        </ul>

        <H2>Retention and security</H2>
        <p>
          We keep data while the Business uses DexaAI. Connections use HTTPS, access tokens are stored on the server only, and only the
          Business&apos;s own staff can access its data with personal logins. When a Business disconnects Instagram, the access token is
          deleted.
        </p>

        <H2 id="data-deletion-en">Data deletion</H2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <b>A Business</b> can disconnect Instagram in DexaAI (Settings → Instagram accounts → delete) or remove DexaAI in Instagram
            (Settings → Apps and websites → Remove). Meta then sends us a data deletion request: we delete the access token, messages and
            conversations of that account and return a confirmation code with a status link to this page.
          </li>
          <li>
            <b>A customer</b> who messaged a Business can ask the Business or us to delete their data: send &quot;Delete my data&quot; to{" "}
            <a href={BOT} className="text-brand hover:underline">
              @dexaai_bot
            </a>{" "}
            with your Instagram username and the business name. We delete the conversations and leads within 30 days.
          </li>
        </ul>
      </div>
    </main>
  );
}
