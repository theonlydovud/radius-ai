/**
 * Лёгкий healthcheck для Render и UptimeRobot / cron-job.org.
 * Не ходит в БД — всегда отвечает мгновенно.
 * Доступен также по /ping и /health (см. src/index.ts).
 */
export async function GET() {
  return Response.json(
    {
      ok: true,
      // Render сам кладёт хеш задеплоенного коммита — видно, какая версия работает.
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      uptime_s: Math.round(process.uptime()),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
