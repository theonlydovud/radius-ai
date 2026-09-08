import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect('/accounts?error=access_denied');
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facebook/callback`;

  try {
    // 1. Обмениваем code на короткоживущий Access Token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_secret=${appSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    // 2. Обмениваем короткий токен на долгоживущий (Long-Lived Token на 60 дней)
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
    );
    const longLivedData = await longLivedRes.json();
    const accessToken = longLivedData.access_token;

    // 3. Получаем список связанных Instagram Business аккаунтов
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=name,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();

    const pageWithIg = pagesData.data?.find(
      (p: any) => p.instagram_business_account
    );

    if (!pageWithIg) {
      return NextResponse.redirect('/accounts?error=no_instagram_found');
    }

    const igAccountId = pageWithIg.instagram_business_account.id;
    const accountName = pageWithIg.name;

    // 4. Сохраняем подключенный аккаунт в Supabase
    const supabase = createClient();
    await supabase.from('accounts').insert([
      {
        platform: 'instagram',
        account_name: `@${accountName}`,
        access_token: accessToken,
        platform_account_id: igAccountId,
        status: 'connected',
      },
    ]);

    return NextResponse.redirect('/accounts?success=true');
  } catch (err) {
    console.error('[OAuth Callback Error]:', err);
    return NextResponse.redirect('/accounts?error=server_error');
  }
}