import { runAssistant, transcribeAudio, type AssistantMessage } from "../lib/assistant";
import { GeminiRateLimitError } from "../lib/gemini";
import type { RouteContext } from "../index";

/**
 * ИИ-ассистент панели руководителя (доступ — только owner, см. index.ts).
 *   POST /api/assistant             { message, history?, account_id? } → { reply, actions }
 *   POST /api/assistant/transcribe  { audio: base64, mime }            → { text }
 */

const BUSY = "Сейчас большая нагрузка на ИИ, повторите через минуту.";

export const chat = {
  async POST(req: Request, ctx: RouteContext) {
    const auth = ctx.auth!;
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim().slice(0, 2000);
    if (!message) return Response.json({ error: "Пустой запрос." }, { status: 400 });
    const history: AssistantMessage[] = Array.isArray(body.history)
      ? body.history.filter((m: any) => (m?.role === "user" || m?.role === "model") && typeof m.text === "string").map((m: any) => ({ role: m.role, text: m.text.slice(0, 4000) }))
      : [];
    const accountId = typeof body.account_id === "string" && /^[0-9a-f-]{36}$/i.test(body.account_id) ? body.account_id : null;
    try {
      return Response.json({ data: await runAssistant(auth, history, message, accountId) });
    } catch (e: any) {
      console.error("[assistant] ошибка:", e?.message ?? e);
      return Response.json({ error: e instanceof GeminiRateLimitError ? BUSY : "Ассистент не смог ответить. Попробуйте ещё раз." }, { status: 502 });
    }
  },
};

const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|mp3)(;.*)?$/;
const MAX_AUDIO_BYTES = 3_000_000; // ~3 МБ — несколько минут речи в opus

export const transcribe = {
  async POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const audio = String(body.audio ?? "");
    const mime = String(body.mime ?? "audio/webm");
    if (!audio || !AUDIO_TYPES.test(mime)) return Response.json({ error: "Нет записи." }, { status: 400 });
    if ((audio.length * 3) / 4 > MAX_AUDIO_BYTES) return Response.json({ error: "Запись слишком длинная." }, { status: 413 });
    try {
      return Response.json({ data: { text: await transcribeAudio(audio, mime.split(";")[0]) } });
    } catch (e: any) {
      console.error("[assistant] расшифровка:", e?.message ?? e);
      return Response.json({ error: e instanceof GeminiRateLimitError ? BUSY : "Не удалось распознать голос." }, { status: 502 });
    }
  },
};
