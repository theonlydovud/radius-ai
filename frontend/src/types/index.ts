export type Platform = "instagram" | "telegram";
export type AccountStatus = "connected" | "disconnected" | "error";

export interface Account {
  id: string;
  platform: Platform;
  account_name: string;
  access_token: string;
  webhook_verify_token: string | null;
  status: AccountStatus;
  created_at: string;
  /** ID аккаунта на платформе (Instagram: entry.id в вебхуках). */
  platform_account_id?: string | null;
  /** Аккаунт-агент, чьи знания и правила использует этот аккаунт. NULL — свои. */
  knowledge_source_id?: string | null;
}

/** Version of Account safe to send to the browser — token is masked. */
export interface AccountPublic extends Omit<Account, "access_token"> {
  access_token_preview: string;
}

export type RuleType = "tone" | "qualification_requirements" | "general";

export interface SystemRule {
  id: string;
  account_id?: string;
  rule_type: RuleType;
  title: string;
  rule_text: string;
  is_active: boolean;
}

export interface KnowledgeItem {
  id: string;
  account_id?: string;
  title: string;
  content: string;
  embedding?: number[] | null;
  created_at: string;
}

export type SessionStatus = "ai_active" | "manager_takeover" | "closed";

export interface ChatSession {
  id: string;
  account_id: string;
  client_id: string;
  client_name: string;
  status: SessionStatus;
  created_at: string;
  accounts?: Pick<Account, "platform" | "account_name">;
}

export type Sender = "user" | "ai" | "manager";

export interface Message {
  id: string;
  session_id: string;
  sender: Sender;
  text: string;
  created_at: string;
}

export type LeadStatus = "new" | "in_progress" | "offered" | "sold" | "not_sold";

export type LostReason =
  | "too_expensive"
  | "no_response"
  | "just_asking"
  | "nothing_to_offer"
  | "bad_timing"
  | "chose_other"
  | "other"
  | "closed_themselves"
  | "not_relevant"
  | "duplicate_spam"
  // причины шаблонов и свои причины компании («custom:Текст»)
  | (string & {});

export type Currency = "USD" | "UZS" | "EUR" | "RUB";

export interface Manager {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  telegram_id?: number | null;
}

export interface LeadCollectedData {
  origin_city?: string;
  destination_city?: string;
  weight?: string;
  cargo_type?: string;
  /** Что хочет клиент — у компаний не из логистики вместо маршрута и груза. */
  request?: string;
  /** Партнёр: машина / что предлагает и направления. */
  partner_offer?: string;
  partner_directions?: string;
  /** Комментарий к заявке, созданной вручную. */
  note?: string;
  /** Кто создал заявку вручную; нет — собрал ИИ. */
  created_by?: string;
  [key: string]: string | undefined;
}

export interface Lead {
  id: string;
  /** client — заявка клиента; partner — партнёр (водитель): вне воронки, без ответственного. */
  kind?: "client" | "partner";
  /** NULL — заявка создана вручную, переписки нет. */
  session_id: string | null;
  client_name: string;
  client_phone: string;
  collected_data: LeadCollectedData;
  status: LeadStatus;
  created_at: string;
  manager_id: string | null;
  manager: Pick<Manager, "id" | "name"> | null;
  source: { platform: Platform; account_name: string } | null;
  closed_at: string | null;
  closed_by: string | null;
  lost_reason: LostReason | null;
  lost_comment: string | null;
  /** Кто нажал «✅ Ishga oldim» в Telegram и когда. */
  taken_by?: string | null;
  taken_at?: string | null;
  assigned_at?: string | null;
  offered_at?: string | null;
  status_changed_at?: string | null;
  /** Блок сделки: вид, ставка клиенту (сумма сделки), ставка перевозчика (себестоимость), валюта. */
  deal_type?: string | null;
  deal_price?: number | null;
  deal_cost?: number | null;
  deal_currency?: Currency | null;
  /** Маржа — только у руководителя. */
  margin?: number;
  /** «Дорого»: цена, которую хотел клиент / цена конкурента. */
  lost_price?: number | null;
  lost_currency?: Currency | null;
  next_contact_date?: string | null;
  next_contact_note?: string | null;
  /** Контроль сроков: нет ставки / зависла. */
  overdue?: { no_offer: boolean; stuck: boolean };
}

export type WorkRow = {
  id: string | null;
  name: string;
  leads: number;
  taken: number;
  avg_take_minutes: number | null;
  avg_offer_minutes: number | null;
  offer_percent: number | null;
  funnel: { leads: number; offered: number; sold: number };
  sold: number;
  margin?: Record<string, { sum: number; avg: number; count: number }>;
  lost: Partial<Record<LostReason, number>>;
  overdue: { no_offer: number; stuck: number };
};

export type RouteWork = {
  route: string;
  leads: number;
  offered: number;
  sold: number;
  conversion: number | null;
  top_reason: LostReason | null;
  too_expensive: { currency: string; our_avg: number | null; client_avg: number | null }[];
};

export interface LeadStats {
  totals: {
    total: number;
    new: number;
    in_progress: number;
    offered?: number;
    sold: number;
    not_sold: number;
    conversion: number | null;
  };
  /** Работа логистов и направления (ТЗ «контроль работы с заявками»). */
  work?: { logists: WorkRow[]; routes: RouteWork[] };
  managers: {
    id: string | null;
    name: string;
    received: number;
    sold: number;
    not_sold: number;
    conversion: number | null;
  }[];
  reasons: { reason: LostReason; count: number; percent: number }[];
  sources: { platform: Platform; count: number; percent: number }[];
  routes: { route: string; count: number }[];
  /** По дням: пришло всего и чем закончились (open = новые + в работе). */
  daily: { date: string; count: number; open: number; sold: number; not_sold: number }[];
}

export interface SandboxChatMessage {
  role: "user" | "model";
  text: string;
}
