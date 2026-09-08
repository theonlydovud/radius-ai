import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Обновляет сессию Supabase Auth на каждом запросе, чтобы серверные
 * компоненты и Route Handlers всегда видели актуальные cookies.
 * Сама платформа сейчас работает без авторизации (внутренний дашборд
 * логиста) — этот middleware подготовлен на случай, если вы добавите
 * Supabase Auth (например, вход менеджера по email/паролю).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  await supabase.auth.getSession();

  return response;
}

export const config = {
  matcher: [
    /*
     * Пропускаем статику Next.js и вебхуки — их не должна касаться
     * логика обновления пользовательской сессии.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)",
  ],
};
