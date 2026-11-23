import { createAdminClient } from "./supabase/server";
import { companyInfo, type AuthCompany } from "./auth";
import { isWorkTime, leadWordsRu, localParts, workStartFrom } from "./company-settings";
import { leadControl, overdueOf } from "./leads";
import { sendToEmployee } from "./dexa-bot";
import { escapeHtml, getLeadNotifySettings, resolveTarget, tgCall } from "./lead-notify";
import { frontendUrl } from "./urls";

/**
 * Напоминания логистам в личный Telegram (бот DexaAI) и эскалация руководителю.
 * Раз в минуту, только в рабочие часы компании: что выпало на ночь и выходные,
 * уходит в начале следующего рабочего дня. Каждое сообщение — один раз (lead_reminders).
 *
 *   assigned   — «У вас новая заявка» (при назначении ответственным);
 *   not_taken  — «Заявка не взята в работу» через N минут после назначения
 *                (для пришедших ночью — от начала рабочего дня);
 *   no_offer   — «Нет ставки по заявке»: в работе дольше no_offer_hours;
 *   stuck      — «Заявка висит»: нет смены статуса stuck_days, затем раз в день;
 *   next       — «Сегодня следующий контакт» по полю «Следующий контакт».
 * Эскалация: «Нет ставки» и «Зависла» — одно сообщение в Telegram-группу заявок
 * (у компаний без группы — руководителю в личный Telegram).
 */

const INTERVAL_MS = 60_000;
const SEND_GAP_MS = 350; // Telegram не любит много сообщений в один чат подряд
const ASSIGNED_FRESH_MS = 2 * 86_400_000; // «новая заявка» — только про свежие назначения

type Lead = {
  id: string;
  company_id: string;
  client_name: string | null;
  client_phone: string | null;
  collected_data: Record<string, string | undefined> | null;
  status: string;
  manager_id: string | null;
  assigned_at: string | null;
  taken_at: string | null;
  status_changed_at: string | null;
  created_at: string;
  next_contact_date: string | null;
  next_contact_note: string | null;
  managers?: { name: string; telegram_id: number | null } | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function summary(lead: Lead) {
  const d = lead.collected_data ?? {};
  const lines = [`👤 ${escapeHtml(lead.client_name || "Клиент")}${lead.client_phone ? ` · ${escapeHtml(lead.client_phone)}` : ""}`];
  if (d.origin_city || d.destination_city) lines.push(`🛣 ${escapeHtml(d.origin_city || "—")} → ${escapeHtml(d.destination_city || "—")}`);
  const cargo = [d.cargo_type, d.weight].filter(Boolean).join(" · ");
  if (cargo) lines.push(`📦 ${escapeHtml(cargo)}`);
  if (d.request) lines.push(`📝 ${escapeHtml(d.request)}`);
  return lines.join("\n");
}

const cardLink = (lead: Lead, company: AuthCompany) => ({ text: `Открыть ${leadWordsRu(company.settings.terms).acc}`, url: frontendUrl(`/leads?lead=${lead.id}`) });

/** Отметка «отправлено»: true — отправлять (раньше не отправляли). Ставится до отправки — без дублей. */
async function claim(supabase: any, leadId: string, key: string) {
  const { error } = await supabase.from("lead_reminders").insert({ lead_id: leadId, key });
  if (!error) return true;
  if (error.code !== "23505" && !/duplicate/i.test(error.message)) console.warn(`[reminders] ${error.message}`);
  return false;
}

/** Куда эскалировать: группа заявок (бот заявок) или руководителю в личку (бот DexaAI). */
async function escalate(supabase: any, company: AuthCompany, html: string, lead: Lead) {
  if (company.telegram_leads) {
    const { token, group, owner } = resolveTarget(await getLeadNotifySettings());
    const chat = group ?? owner;
    if (token && chat) {
      await tgCall(token, "sendMessage", {
        chat_id: chat,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[cardLink(lead, company)]] },
      }).catch((e: any) => console.warn(`[reminders] группа: ${e?.message}`));
      return;
    }
  }
  const { data: owners } = await supabase.from("app_users").select("telegram_id").eq("company_id", company.id).eq("role", "owner").not("telegram_id", "is", null);
  for (const o of owners ?? []) await sendToEmployee(o.telegram_id, html, cardLink(lead, company));
}

async function companyReminders(supabase: any, company: AuthCompany, now: Date) {
  const { deadlines, work } = company.settings;
  if (!isWorkTime(now, work)) return;
  const today = localParts(now, work.tz).date;

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, company_id, client_name, client_phone, collected_data, status, manager_id, assigned_at, taken_at, status_changed_at, created_at, next_contact_date, next_contact_note, managers(name, telegram_id)")
    .eq("company_id", company.id)
    .eq("kind", "client") // партнёрам (водителям) напоминаний нет
    .in("status", ["new", "in_progress", "offered"]);
  if (error) {
    if (!/column/.test(error.message)) console.warn(`[reminders] ${company.name}: ${error.message}`);
    return; // до migration-deals.sql колонок нет — напоминания молчат
  }
  if (!leads?.length) return;

  // Личный Telegram логиста: привязанный в профиле (app_users), иначе — из очереди менеджеров.
  const { data: users } = await supabase.from("app_users").select("manager_id, telegram_id").eq("company_id", company.id).not("manager_id", "is", null).not("telegram_id", "is", null);
  const chatOf = new Map<string, number>((users ?? []).map((u: any) => [u.manager_id, u.telegram_id]));

  // Контроль сроков (не взята, нет ставки, зависла, эскалации) — только если модуль включён.
  const control = leadControl(company.settings);
  const W = leadWordsRu(company.settings.terms);
  const noOffer = company.settings.terms.amount === "rate" ? "Нет ставки" : "Нет предложения";

  for (const lead of leads as Lead[]) {
    const chat = lead.manager_id ? chatOf.get(lead.manager_id) ?? lead.managers?.telegram_id ?? null : null;
    const over = overdueOf(lead, control, now.getTime());
    const personal: { key: string; html: string }[] = [];

    if (lead.manager_id && lead.assigned_at) {
      if (now.getTime() - Date.parse(lead.assigned_at) < ASSIGNED_FRESH_MS) {
        personal.push({ key: `assigned:${lead.assigned_at}`, html: `📥 <b>У вас ${W.New.toLowerCase()}</b>\n${summary(lead)}` });
      }
      const due = workStartFrom(new Date(lead.assigned_at), work).getTime() + deadlines.not_taken_minutes * 60_000;
      if (control && lead.status === "new" && now.getTime() >= due) {
        personal.push({ key: `not_taken:${lead.assigned_at}`, html: `⏰ <b>${W.One} не взят${W.a} в работу</b> — прошло больше ${deadlines.not_taken_minutes} мин после назначения.\n${summary(lead)}` });
      }
    }
    if (over.no_offer) {
      personal.push({ key: `no_offer:${lead.taken_at ?? lead.status_changed_at}`, html: `💸 <b>${noOffer} по ${W.dat}</b> — в работе больше ${deadlines.no_offer_hours} ч.\n${summary(lead)}` });
    }
    if (over.stuck) {
      personal.push({ key: `stuck:${lead.status_changed_at}:${today}`, html: `🕸 <b>${W.One} висит</b> — без движения больше ${deadlines.stuck_days} дн.\n${summary(lead)}` });
    }
    if (lead.next_contact_date === today) {
      const note = lead.next_contact_note ? `: ${escapeHtml(lead.next_contact_note)}` : "";
      personal.push({ key: `next:${today}`, html: `📅 <b>Сегодня следующий контакт</b>${note}\n${summary(lead)}` });
    }

    if (chat) {
      for (const p of personal) {
        if (!(await claim(supabase, lead.id, p.key))) continue;
        await sendToEmployee(chat, p.html, cardLink(lead, company));
        await sleep(SEND_GAP_MS);
      }
    }

    // Эскалация руководителю — один раз на каждую метку.
    const who = escapeHtml(lead.managers?.name ?? "не назначен");
    if (over.no_offer && (await claim(supabase, lead.id, `esc_no_offer:${lead.taken_at ?? lead.status_changed_at}`))) {
      await escalate(supabase, company, `🚨 <b>${noOffer}</b> больше ${deadlines.no_offer_hours} ч · ответственный: ${who}\n${summary(lead)}`, lead);
      await sleep(SEND_GAP_MS);
    }
    if (over.stuck && (await claim(supabase, lead.id, `esc_stuck:${lead.status_changed_at}`))) {
      await escalate(supabase, company, `🚨 <b>${W.One} завис${W.a ? "ла" : ""}</b> — ${deadlines.stuck_days} дн. без движения · ответственный: ${who}\n${summary(lead)}`, lead);
      await sleep(SEND_GAP_MS);
    }
  }
}

export async function runReminders(now = new Date()) {
  const supabase = createAdminClient();
  const { data: rows } = await supabase.from("companies").select("id");
  for (const row of rows ?? []) {
    const company = await companyInfo(row.id);
    if (!company || company.status === "expired") continue;
    await companyReminders(supabase, company, now).catch((e) => console.error(`[reminders] ${company.name}: ${e?.message ?? e}`));
  }
}

export function startReminders() {
  let running = false;
  const tick = async () => {
    if (running) return; // прошлый проход ещё идёт
    running = true;
    try {
      await runReminders();
    } finally {
      running = false;
    }
  };
  const interval = Number(process.env.REMINDERS_INTERVAL_MS || INTERVAL_MS);
  setTimeout(tick, Math.min(45_000, interval));
  setInterval(tick, interval).unref();
}
