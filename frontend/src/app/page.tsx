import type { Metadata } from "next";
import { LandingContent } from "@/components/landing/landing-content";

export const metadata: Metadata = {
  title: "DexaAI — ИИ-менеджер для Instagram Direct и CRM для заявок",
  description:
    "DexaAI отвечает клиентам в Instagram Direct 24/7, сам собирает заявку и передаёт её менеджеру. Простая CRM с показателями и графиками.",
};

export default function LandingPage() {
  return <LandingContent />;
}
