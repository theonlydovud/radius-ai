/**
 * Где работает компания:
 *   есть поддомен (Radius: radius) → radius.dexa.uz;
 *   нет (пробный период, новые компании) → прямо на dexa.uz.
 * Вход — на dexa.uz, после успешного входа — переход на адрес своей компании.
 * Кука входа общая для всего домена dexa.uz (см. backend/src/lib/auth.ts), поэтому
 * на поддомене пользователь уже вошёл.
 * На прочих адресах (localhost, превью Vercel) переходов между адресами нет.
 */

export const LANDING_HOST = process.env.NEXT_PUBLIC_LANDING_HOST || "dexa.uz";

export type WorkspaceCompany = { subdomain?: string | null } | null | undefined;

/** Мы на dexa.uz или его поддомене (а не на localhost/превью)? */
function onDexaDomain() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === LANDING_HOST || h.endsWith(`.${LANDING_HOST}`);
}

/** Мы на сайте продукта (dexa.uz / www.dexa.uz)? */
export function onLandingHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === LANDING_HOST || h === `www.${LANDING_HOST}`;
}

export function hostFor(company: WorkspaceCompany) {
  return company?.subdomain ? `${company.subdomain}.${LANDING_HOST}` : LANDING_HOST;
}

/** Адрес страницы на адресе компании: другой адрес — полный URL, тот же — путь как есть. */
export function workspaceUrl(path: string, company: WorkspaceCompany) {
  if (!onDexaDomain()) return path;
  const target = hostFor(company);
  if (window.location.hostname === target) return path;
  const { protocol, port } = window.location;
  return `${protocol}//${target}${port ? `:${port}` : ""}${path}`;
}

/** Перейти на адрес компании: на другой адрес — полной загрузкой, на этом же — обычным переходом. */
export function goToWorkspace(
  path: string,
  router: { push: (p: string) => void; replace: (p: string) => void },
  company: WorkspaceCompany,
  replace = false
) {
  const url = workspaceUrl(path, company);
  if (url !== path) window.location[replace ? "replace" : "assign"](url);
  else if (replace) router.replace(path);
  else router.push(path);
}
