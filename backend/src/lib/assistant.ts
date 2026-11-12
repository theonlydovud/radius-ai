import { FunctionCallingMode, SchemaType, type Content, type FunctionDeclaration, type Part } from "@google/generative-ai";
import { genAI, GEMINI_MODEL, withRetry } from "./gemini";
import { createAdminClient } from "./supabase/server";
import { buildLeadStats, fetchLead, fetchLeads, LOST_REASONS, STATUS_GROUPS } from "./leads";
import { createManualLead } from "./manual-lead";
import type { AuthUser } from "./auth";

/**
 * ИИ-ассистент панели руководителя. Понимает просьбы вроде
 * «Отправь заявку Хуршиду, груз из Ташкента в Поти, 50 тонн шёлка» или
 * «Покажи статистику за прошлую неделю» и выполняет их инструментами (function calling).
 * Возвращает текст ответа и «действия» — карточки для интерфейса (заявка, статистика, список).
 */

const TZ = "Asia/Tashkent"; // UTC+5, без перехода на летнее время
const MAX_STEPS = 5;

export type AssistantMessage = { role: "user" | "model"; text: string };
export type AssistantAction =
  | { type: "lead"; verb: "created" | "updated"; lead: any }
  | { type: "stats"; from: string; to: string; manager: string | null; stats: any }
  | { type: "leads"; title: string; leads: any[] };

const S = SchemaType;
const str = (description: string) => ({ type: S.STRING, description });

const TOOLS: FunctionDeclaration[] = [
  {
    name: "create_lead",
    description: "Создать заявку вручную и назначить ответственного менеджера.",
    parameters: {
      type: S.OBJECT,
      properties: {
        client_name: str("Имя клиента или компании, если названо"),
        client_phone: str("Телефон клиента, если назван"),
        origin_city: str("Откуда (город/страна)"),
        destination_city: str("Куда (город/страна)"),
        weight: str("Вес или объём, как сказал пользователь, например «50 т»"),
        cargo_type: str("Что за груз"),
        note: str("Комментарий, если есть"),
        manager: str("Точное имя менеджера из списка, «auto» — следующий по очереди, «none» — без ответственного. По умолчанию auto."),
      },
    },
  },
  {
    name: "get_stats",
    description: "Статистика заявок за период: всего, по статусам, конверсия, по менеджерам, причины отказа, направления.",
    parameters: {
      type: S.OBJECT,
      properties: {
        from: str("Начало периода YYYY-MM-DD (по Ташкенту)"),
        to: str("Конец периода YYYY-MM-DD включительно"),
        manager: str("Имя менеджера, если нужна статистика одного менеджера"),
      },
      required: ["from", "to"],
    },
  },
  {
    name: "list_leads",
    description: "Найти заявки: по статусу, менеджеру, периоду и тексту (имя, телефон, город, груз).",
    parameters: {
      type: S.OBJECT,
      properties: {
        status: { type: S.STRING, format: "enum", enum: ["active", "sold", "not_sold", "all"], description: "active = новые и в работе" },
        manager: str("Имя менеджера или «none» — без ответственного"),
        from: str("С даты YYYY-MM-DD"),
        to: str("По дату YYYY-MM-DD"),
        query: str("Поиск по имени, телефону, городу или грузу"),
        limit: { type: S.INTEGER, description: "Сколько показать, по умолчанию 10" },
      },
    },
  },
  {
    name: "update_lead",
    description: "Изменить заявку: взять в работу, закрыть как продано / не продано, сменить ответственного. Заявку найти по id или по тексту (имя клиента, телефон).",
    parameters: {
      type: S.OBJECT,
      properties: {
        lead_id: str("id заявки, если известен из предыдущих ответов"),
        find: str("Имя клиента, телефон или город, если id неизвестен"),
        status: { type: S.STRING, format: "enum", enum: ["in_progress", "sold", "not_sold"], description: "Новый статус" },
        lost_reason: {
          type: S.STRING,
          format: "enum",
          enum: [...LOST_REASONS],
          description: "Причина для «не продано»: too_expensive — дорого, closed_themselves — сами закрыли, nothing_to_offer — нечего предложить, not_relevant — неактуальная, no_response — клиент не отвечает, duplicate_spam — дубль/спам",
        },
        manager: str("Новый ответственный: точное имя менеджера или «none»"),
      },
    },
  },
  {
    name: "list_managers",
    description: "Список менеджеров и их статус (включён ли в очередь).",
    parameters: { type: S.OBJECT, properties: {} },
  },
];

// ---------------------------------------------------------------------
// Даты по Ташкенту
// ---------------------------------------------------------------------

function tashkentToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const dayStart = (d: string) => new Date(`${d}T00:00:00+05:00`).toISOString();
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+05:00`).toISOString();
const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

// ---------------------------------------------------------------------
// Инструменты
// ---------------------------------------------------------------------

type Ctx = { auth: AuthUser; accountId: string | null; managers: { id: string; name: string; is_active: boolean }[]; actions: AssistantAction[] };

function findManager(ctx: Ctx, name?: string) {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return ctx.managers.find((m) => m.name.toLowerCase() === n) ?? ctx.managers.find((m) => m.name.toLowerCase().includes(n) || n.includes(m.name.toLowerCase()));
}

/** Короткое описание заявки для модели. */
function brief(l: any) {
  const d = l.collected_data ?? {};
  return {
    id: l.id,
    client: l.client_name,
    phone: l.client_phone || null,
    route: `${d.origin_city ?? "—"} → ${d.destination_city ?? "—"}`,
    cargo: [d.weight, d.cargo_type].filter(Boolean).join(", ") || null,
    status: l.status,
    manager: l.manager?.name ?? null,
    created_at: l.created_at,
  };
}

async function runTool(name: string, args: Record<string, any>, ctx: Ctx): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();

  if (name === "list_managers") {
    return { managers: ctx.managers.map((m) => ({ name: m.name, active: m.is_active })) };
  }

  if (name === "create_lead") {
    const wanted = String(args.manager ?? "auto").trim();
    let manager_id: string | null = "auto";
    if (/^none$|^нет$/i.test(wanted)) manager_id = null;
    else if (!/^auto$/i.test(wanted)) {
      const m = findManager(ctx, wanted);
      if (!m) return { error: `Менеджер «${wanted}» не найден. Есть: ${ctx.managers.map((x) => x.name).join(", ")}` };
      manager_id = m.id;
    }
    const result = await createManualLead(
      ctx.auth,
      { ...args, manager_id, account_id: ctx.accountId ?? undefined, created_by: `${ctx.auth.name} (ИИ-ассистент)` },
      { requirePhone: false }
    );
    if ("error" in result) return { error: result.error };
    ctx.actions.push({ type: "lead", verb: "created", lead: result.lead });
    return { created: brief(result.lead) };
  }

  if (name === "get_stats") {
    if (!isDay(args.from) || !isDay(args.to)) return { error: "Нужны даты from и to в формате YYYY-MM-DD." };
    const m = args.manager ? findManager(ctx, args.manager) : undefined;
    if (args.manager && !m) return { error: `Менеджер «${args.manager}» не найден.` };
    const leads = await fetchLeads(supabase, { company: ctx.auth.company.id, from: dayStart(args.from), to: dayEnd(args.to), manager: m?.id, account: ctx.accountId ?? undefined });
    const stats = buildLeadStats(leads, m ? [m] : ctx.managers, { from: dayStart(args.from), to: dayEnd(args.to), timeZone: TZ });
    ctx.actions.push({ type: "stats", from: args.from, to: args.to, manager: m?.name ?? null, stats });
    return { period: `${args.from} — ${args.to}`, totals: stats.totals, managers: stats.managers, reasons: stats.reasons.filter((r: any) => r.count), routes: stats.routes.slice(0, 5) };
  }

  if (name === "list_leads") {
    const status = STATUS_GROUPS[args.status] ? args.status : args.status === "all" ? undefined : "active";
    let manager: string | undefined;
    if (args.manager) {
      if (/^none$/i.test(args.manager)) manager = "none";
      else {
        const m = findManager(ctx, args.manager);
        if (!m) return { error: `Менеджер «${args.manager}» не найден.` };
        manager = m.id;
      }
    }
    let leads = await fetchLeads(supabase, {
      company: ctx.auth.company.id,
      group: status,
      manager,
      from: isDay(args.from) ? dayStart(args.from) : undefined,
      to: isDay(args.to) ? dayEnd(args.to) : undefined,
      account: ctx.accountId ?? undefined,
    });
    const q = String(args.query ?? "").trim().toLowerCase();
    if (q) {
      leads = leads.filter((l: any) => {
        const d = l.collected_data ?? {};
        return [l.client_name, l.client_phone, d.origin_city, d.destination_city, d.cargo_type, d.weight].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
    }
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
    const shown = leads.slice(0, limit);
    ctx.actions.push({ type: "leads", title: `${leads.length}`, leads: shown });
    return { total: leads.length, shown: shown.map(brief) };
  }

  if (name === "update_lead") {
    let lead: any = null;
    if (args.lead_id) lead = await fetchLead(supabase, String(args.lead_id), ctx.auth.company.id).catch(() => null);
    if (!lead && args.find) {
      const q = String(args.find).trim().toLowerCase();
      const all = await fetchLeads(supabase, { company: ctx.auth.company.id, account: ctx.accountId ?? undefined });
      const hits = all.filter((l: any) => {
        const d = l.collected_data ?? {};
        return [l.client_name, l.client_phone, d.origin_city, d.destination_city].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
      if (hits.length > 1) return { error: "Найдено несколько заявок — уточните.", candidates: hits.slice(0, 5).map(brief) };
      lead = hits[0] ?? null;
    }
    if (!lead) return { error: "Заявка не найдена." };

    const updates: Record<string, unknown> = {};
    if (args.manager !== undefined && args.manager !== null && args.manager !== "") {
      if (/^none$/i.test(args.manager)) updates.manager_id = null;
      else {
        const m = findManager(ctx, args.manager);
        if (!m) return { error: `Менеджер «${args.manager}» не найден.` };
        updates.manager_id = m.id;
      }
    }
    const closed = { closed_at: new Date().toISOString(), closed_by: ctx.auth.name };
    if (args.status === "in_progress") Object.assign(updates, { status: "in_progress", closed_at: null, closed_by: null, lost_reason: null, lost_comment: null });
    if (args.status === "sold") Object.assign(updates, { status: "sold", lost_reason: null, lost_comment: null }, closed);
    if (args.status === "not_sold") {
      if (!LOST_REASONS.includes(args.lost_reason)) return { error: "Для «не продано» нужна причина.", reasons: LOST_REASONS };
      Object.assign(updates, { status: "not_sold", lost_reason: args.lost_reason }, closed);
    }
    if (!Object.keys(updates).length) return { error: "Не понял, что изменить в заявке." };

    const { error } = await supabase.from("leads").update(updates).eq("id", lead.id).eq("company_id", ctx.auth.company.id);
    if (error) return { error: error.message };
    const fresh = await fetchLead(supabase, lead.id, ctx.auth.company.id);
    ctx.actions.push({ type: "lead", verb: "updated", lead: fresh });
    return { updated: brief(fresh) };
  }

  return { error: `Неизвестный инструмент ${name}` };
}

// ---------------------------------------------------------------------
// Диалог
// ---------------------------------------------------------------------

export async function runAssistant(auth: AuthUser, history: AssistantMessage[], message: string, accountId: string | null) {
  const supabase = createAdminClient();
  const { data: managers } = await supabase.from("managers").select("id, name, is_active").eq("company_id", auth.company.id).order("sort_order", { ascending: true });
  const ctx: Ctx = { auth, accountId, managers: (managers ?? []) as Ctx["managers"], actions: [] };

  let accountLine = "Все Instagram-аккаунты компании.";
  if (accountId) {
    const { data: acc } = await supabase.from("accounts").select("account_name").eq("id", accountId).eq("company_id", auth.company.id).maybeSingle();
    if (acc) accountLine = `Выбран аккаунт ${acc.account_name}: заявки и статистика — только по нему, новые заявки создаются в нём.`;
  }

  const today = tashkentToday();
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, weekday: "long" }).format(new Date());
  const systemInstruction = `Ты — ИИ-ассистент панели руководителя DexaAI компании «${auth.company.name}». С тобой говорит ${auth.name}.
Сегодня ${today} (${weekday}), часовой пояс Ташкента. ${accountLine}
Менеджеры: ${ctx.managers.map((m) => `${m.name}${m.is_active ? "" : " (выключен)"}`).join(", ") || "нет"}.

Как работать:
- Действия выполняй инструментами, не выдумывай данные. Если просят заявку, статистику или список — сразу вызывай инструмент.
- Периоды считай сам: «сегодня», «вчера», «эта неделя» (с понедельника), «прошлая неделя» (понедельник–воскресенье прошлой недели), «этот месяц», «прошлый месяц» и т. п.
- Имена менеджеров могут быть написаны латиницей или с ошибкой (Xurshid, Jasur, Хуршиду) — сопоставь с точным именем из списка.
- Заявку создавай, даже если нет телефона или имени клиента; в ответе коротко скажи, чего не хватает.
- Для «не продано» нужна причина; если её нет — спроси.
- Отвечай коротко, по делу, на языке пользователя (русский, узбекский или английский). Карточки с заявками и цифрами интерфейс покажет сам — не пересказывай их целиком, дай вывод в 1–3 предложениях.`;

  const model = genAI.getGenerativeModel(
    { model: GEMINI_MODEL, systemInstruction, tools: [{ functionDeclarations: TOOLS }], toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } } },
    { timeout: 30_000 }
  );
  // Диалог собираем сами, без ChatSession: SDK 0.21 шлёт ответы инструментов с ролью "function",
  // а текущие модели принимают их только с ролью "user".
  const contents: Content[] = history
    .filter((m) => m.text?.trim())
    .slice(-12)
    .map((m): Content => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text: message }] });

  let response = (await withRetry(() => model.generateContent({ contents }))).response;
  for (let step = 0; step < MAX_STEPS; step++) {
    const calls = response.functionCalls() ?? [];
    if (!calls.length) break;
    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push({ role: "model", parts: modelTurn.parts });
    const parts: Part[] = [];
    for (const call of calls) {
      let result: Record<string, unknown>;
      try {
        result = await runTool(call.name, (call.args ?? {}) as Record<string, any>, ctx);
      } catch (e: any) {
        result = { error: e?.message ?? "Ошибка инструмента" };
      }
      parts.push({ functionResponse: { name: call.name, response: result } });
    }
    contents.push({ role: "user", parts });
    try {
      response = (await withRetry(() => model.generateContent({ contents }))).response;
    } catch (e) {
      // Действие уже выполнено — не показываем ошибку, иначе пользователь повторит команду и создаст дубль.
      if (ctx.actions.length) return { reply: "Готово.", actions: ctx.actions };
      throw e;
    }
  }

  let reply = "";
  try {
    reply = response.text().trim();
  } catch {
    /* ответ без текста */
  }
  return { reply: reply || (ctx.actions.length ? "Готово." : "Не понял запрос — попробуйте сформулировать иначе."), actions: ctx.actions };
}

/** Голос → текст: запись из браузера (webm/ogg/mp4) расшифровывает Gemini. */
export async function transcribeAudio(base64: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL }, { timeout: 30_000 });
  const res = await withRetry(() =>
    model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      {
        text: "Дословно расшифруй эту голосовую команду (русский, узбекский или английский). Верни только текст команды, без пояснений и кавычек. Если речи нет — верни пустую строку.",
      },
    ])
  );
  return res.response.text().trim();
}
