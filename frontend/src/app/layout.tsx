import type { Metadata } from "next";
import { cookies } from "next/headers";
// В Next.js 14 шрифт Geist ещё не входит в next/font/google (это появилось
// в Next.js 15) — используем официальный пакет `geist` от Vercel, который
// даёт тот же шрифт и тот же паттерн подключения через CSS-переменную.
import { GeistSans } from "geist/font/sans";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { isLang, LANG_COOKIE, THEME_SCRIPT } from "@/lib/prefs-shared";
import "./globals.css";

export const metadata: Metadata = {
  title: "DexaAI",
  description: "ИИ-менеджер для Instagram Direct и простая CRM для заявок.",
  // Установленное приложение на iPad/iPhone тоже открывается без адресной строки.
  appleWebApp: { capable: true, title: "DexaAI", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Язык — из куки: страница сразу приходит на выбранном языке.
  const saved = cookies().get(LANG_COOKIE)?.value;
  const lang = isLang(saved) ? saved : "ru";
  return (
    <html lang={lang} className={GeistSans.variable} suppressHydrationWarning>
      <head>
        {/* Тёмная тема ставится до первой отрисовки — без белой вспышки. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <I18nProvider initial={lang}>
          <ThemeProvider>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
