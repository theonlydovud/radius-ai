import { NextResponse } from 'next/server';

// Без этого Next.js выполняет GET один раз при `next build` и отдаёт замороженный результат.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facebook/callback`;

  // Запрашиваем разрешения на доступ к сообщениям и страницам
  const scope = [
    'instagram_basic',
    'instagram_manage_messages',
    'pages_manage_metadata',
    'pages_show_list',
  ].join(',');

  const fbAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scope}&response_type=code`;

  return NextResponse.redirect(fbAuthUrl);
}