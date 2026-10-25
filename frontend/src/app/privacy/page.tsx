import type { Metadata } from "next";

// Публичная страница для Meta for Developers: Privacy Policy URL и
// User data deletion → Data deletion instructions URL (/privacy#data-deletion).
export const metadata: Metadata = {
  title: "Политика конфиденциальности — Radius Logistics",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-slate-700">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Политика конфиденциальности</h1>
      <p className="mb-8 text-slate-400">Radius Logistics · Privacy Policy</p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Какие данные мы обрабатываем</h2>
        <p>
          Когда вы пишете Radius Logistics в Instagram Direct или Telegram, на ваши сообщения отвечает
          ИИ-консультант. Мы сохраняем текст переписки, имя или имя пользователя из профиля, а также данные
          заявки, которые вы сами сообщаете: маршрут, вес и тип груза, номер телефона.
        </p>
        <h2 className="text-base font-semibold text-slate-900">Зачем</h2>
        <p>
          Только чтобы ответить на ваш вопрос, рассчитать стоимость перевозки и связаться с вами по заявке.
          Мы не продаём и не передаём данные третьим лицам для рекламы.
        </p>
        <h2 className="text-base font-semibold text-slate-900">Где хранятся и кто обрабатывает</h2>
        <p>
          Данные хранятся в базе Supabase. Для формирования ответов текст сообщений передаётся сервису
          Google Gemini. Доступ к заявкам есть только у сотрудников Radius Logistics.
        </p>
      </section>

      <section id="data-deletion" className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Удаление данных</h2>
        <p>
          Чтобы удалить свои данные, напишите нам в Instagram Direct или Telegram сообщение «Удалить мои
          данные». Мы удалим переписку и заявки, связанные с вашим аккаунтом, и подтвердим удаление в ответном
          сообщении.
        </p>
      </section>

      <hr className="my-10 border-slate-200" />

      <section className="space-y-3 text-slate-500">
        <h2 className="text-base font-semibold text-slate-700">English summary</h2>
        <p>
          When you message Radius Logistics on Instagram Direct or Telegram, an AI assistant replies. We store the
          conversation, your profile name and the shipment details you provide (route, weight, cargo type, phone
          number) only to answer you and prepare a quote. Data is stored in Supabase; message text is processed by
          Google Gemini to generate replies. We do not sell or share your data for advertising. To delete your
          data, send us &quot;Delete my data&quot; via Instagram Direct or Telegram and we will remove your
          conversations and requests.
        </p>
      </section>
    </main>
  );
}
