import type { Metadata } from "next";
// В Next.js 14 шрифт Geist ещё не входит в next/font/google (это появилось
// в Next.js 15) — используем официальный пакет `geist` от Vercel, который
// даёт тот же шрифт и тот же паттерн подключения через CSS-переменную.
import { GeistSans } from "geist/font/sans";
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
  return (
    <html lang="ru" className={GeistSans.variable}>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
