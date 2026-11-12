import { NextResponse, type NextRequest } from "next/server";

/**
 * Один Vercel-проект — несколько адресов:
 *   dexa.uz            — сайт продукта и рабочее место компаний без своего поддомена
 *                        (все, кто зарегистрировался сам и на пробном периоде).
 *   <компания>.dexa.uz — рабочее место компании с поддоменом (radius.dexa.uz). Корень → /login.
 *   radius-log.vercel.app — старый адрес. При LEGACY_REDIRECT=1 перенаправляет на radius.dexa.uz
 *                        с тем же путём (старые ссылки из Telegram продолжают работать).
 * Кто на каком адресе должен работать, знает только сессия — это решает CurrentUserProvider.
 * Остальные адреса (localhost, превью Vercel) — без изменений.
 */

const LANDING_HOST = process.env.LANDING_HOST || "dexa.uz";
/** Куда ведут старые ссылки radius-log.vercel.app. */
const APP_HOST = process.env.APP_HOST || "radius.dexa.uz";
const LEGACY_HOSTS = (process.env.LEGACY_HOSTS || "radius-log.vercel.app").split(",").map((h) => h.trim());

function redirectTo(host: string, req: NextRequest, path = req.nextUrl.pathname) {
  return NextResponse.redirect(`https://${host}${path}${req.nextUrl.search}`, 308);
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const path = req.nextUrl.pathname;

  if (host === LANDING_HOST || host === `www.${LANDING_HOST}`) return NextResponse.next();

  // Поддомен компании: лендинга на нём нет.
  if (host.endsWith(`.${LANDING_HOST}`)) {
    return path === "/" ? NextResponse.redirect(`https://${host}/login`, 307) : NextResponse.next();
  }

  if (process.env.LEGACY_REDIRECT === "1" && LEGACY_HOSTS.includes(host)) {
    return path === "/" ? redirectTo(LANDING_HOST, req) : redirectTo(APP_HOST, req);
  }

  return NextResponse.next();
}

export const config = {
  // Страницы, но не API-прокси, сборка, иконки и файлы.
  matcher: ["/((?!api/|_next/|icon|apple-icon|manifest\\.webmanifest|favicon|.*\\.(?:png|jpg|svg|ico|webmanifest|txt)$).*)"],
};
