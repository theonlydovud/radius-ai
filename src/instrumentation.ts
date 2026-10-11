/**
 * Выполняется Next.js ОДИН раз при старте Node-сервера (до первого запроса,
 * не зависит от того, открывал ли кто-то дашборд или нажимал кнопку).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
