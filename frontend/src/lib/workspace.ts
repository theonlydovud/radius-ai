/**
 * Сайт продукта (dexa.uz) и рабочее место компании (radius.dexa.uz) — разные адреса.
 * Вход происходит на сайте продукта, а после успешного входа — переход в рабочее место.
 * Кука входа общая для всего домена dexa.uz (см. backend/src/lib/auth.ts), поэтому
 * на поддомене пользователь уже вошёл.
 */

export const LANDING_HOST = process.env.NEXT_PUBLIC_LANDING_HOST || "dexa.uz";
export const APP_HOST = process.env.NEXT_PUBLIC_APP_HOST || "radius.dexa.uz";

/** Мы на сайте продукта (а не в рабочем месте)? */
export function onLandingHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === LANDING_HOST || h === `www.${LANDING_HOST}`;
}

/** Адрес страницы рабочего места: на сайте продукта — полный адрес поддомена, иначе — путь как есть. */
export function workspaceUrl(path: string) {
  if (!onLandingHost()) return path;
  const { protocol, port } = window.location;
  return `${protocol}//${APP_HOST}${port ? `:${port}` : ""}${path}`;
}

/** Перейти в рабочее место: на другой адрес — полной загрузкой, на этом же — обычным переходом. */
export function goToWorkspace(path: string, router: { push: (p: string) => void; replace: (p: string) => void }, replace = false) {
  const url = workspaceUrl(path);
  if (url !== path) window.location[replace ? "replace" : "assign"](url);
  else if (replace) router.replace(path);
  else router.push(path);
}
