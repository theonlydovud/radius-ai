import type { Metadata } from "next";
// В Next.js 14 шрифт Geist ещё не входит в next/font/google (это появилось
// в Next.js 15) — используем официальный пакет `geist` от Vercel, который
// даёт тот же шрифт и тот же паттерн подключения через CSS-переменную.
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radius AI — Платформа автоматизации консультирования",
  description:
    "B2B SaaS-платформа автоматизации Instagram Direct и Telegram консультирования для Radius Logistics.",
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
