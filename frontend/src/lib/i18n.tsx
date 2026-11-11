"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en } from "@/lib/locales/en";
import { uz } from "@/lib/locales/uz";
import { isLang, LANG_COOKIE, type Lang } from "@/lib/prefs-shared";

export { isLang, LANG_COOKIE, type Lang };

/**
 * Языки интерфейса: UZ / RU / EN. Ключ перевода — сам русский текст:
 * t("Новая заявка") → «Yangi ariza» / «New lead». Нет перевода — остаётся русский.
 * Подстановки: t("Заявка от {0}", date).
 *
 * Язык хранится в куке dexa_lang: сервер сразу рендерит страницу на нужном языке.
 * t — обычная функция (её можно звать и вне компонентов); при смене языка
 * провайдер перерисовывает всё дерево.
 */

export const LANGS: { value: Lang; label: string; name: string }[] = [
  { value: "uz", label: "UZ", name: "O‘zbekcha" },
  { value: "ru", label: "RU", name: "Русский" },
  { value: "en", label: "EN", name: "English" },
];

const DICTS: Record<Exclude<Lang, "ru">, Record<string, string>> = { uz, en };
const LOCALES: Record<Lang, string> = { ru: "ru-RU", uz: "uz-Latn-UZ", en: "en-GB" };

let current: Lang = "ru";

export function t(text: string, ...args: (string | number | null | undefined)[]) {
  let out = current === "ru" ? text : DICTS[current][text] ?? text;
  args.forEach((a, i) => {
    out = out.split(`{${i}}`).join(a == null ? "" : String(a));
  });
  return out;
}

export function getLang() {
  return current;
}

/** Локаль для дат и чисел. */
export function locale() {
  return LOCALES[current];
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

export function I18nProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  current = lang;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; Path=/; Max-Age=${365 * 24 * 3600}; SameSite=Lax`;
    current = l;
    setLangState(l);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  // key: смена языка перерисовывает всё дерево, включая тексты вне React-состояния.
  return (
    <Ctx.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang вне I18nProvider");
  return ctx;
}
