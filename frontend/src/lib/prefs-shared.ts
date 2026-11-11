/**
 * Общие для сервера и браузера настройки языка и темы. Без "use client":
 * их читает серверный app/layout.tsx.
 */

export type Lang = "ru" | "uz" | "en";
export const LANG_COOKIE = "dexa_lang";

export function isLang(v: unknown): v is Lang {
  return v === "ru" || v === "uz" || v === "en";
}

export const THEME_KEY = "dexa.theme";

/** Скрипт для <head>: ставит .dark до первой отрисовки. */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
