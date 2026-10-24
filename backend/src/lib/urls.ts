/**
 * Публичные адреса частей системы после разделения на frontend (Vercel)
 * и backend (Render).
 *  - BACKEND_PUBLIC_URL — внешний адрес этого сервера. На Render можно не
 *    задавать: платформа сама кладёт его в RENDER_EXTERNAL_URL.
 *  - FRONTEND_URL — адрес дашборда на Vercel (для OAuth-редиректов и CORS).
 */
function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function backendUrl(path = "", fallbackOrigin?: string) {
  const base =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    fallbackOrigin ||
    `http://localhost:${process.env.PORT || 4000}`;
  return `${trimSlash(base)}${path}`;
}

export function frontendUrl(path = "") {
  return `${trimSlash(process.env.FRONTEND_URL || "http://localhost:3000")}${path}`;
}
