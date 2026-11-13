import Link from "next/link";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { t } from "@/lib/i18n";

/** Фон и рамка экранов входа: мягкий градиент DexaAI, карточка по центру. */
export function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="auth-blob absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#7A6CFF]/20 blur-3xl" />
        <div className="auth-blob absolute -right-40 top-1/3 h-[30rem] w-[30rem] rounded-full bg-[#8E5CF7]/15 blur-3xl [animation-delay:-6s]" />
        <div className="absolute inset-0 bg-[radial-gradient(#0f172a0d_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label={t("DexaAI — на главную")}>
          <DexaLogo size={30} />
        </Link>
        <div className="flex items-center gap-1">
          <LangSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>

      {footer && <footer className="relative z-10 pb-6 text-center text-xs text-slate-400">{footer}</footer>}
    </div>
  );
}
