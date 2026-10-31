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

export type LeadStatus = "new" | "in_progress" | "sold" | "not_sold";

export type LostReason =
  | "too_expensive"
  | "closed_themselves"
  | "nothing_to_offer"
  | "not_relevant"
  | "no_response"
  | "duplicate_spam";

export interface Manager {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface LeadCollectedData {
  origin_city?: string;
  destination_city?: string;
  weight?: string;
  cargo_type?: string;
  [key: string]: string | undefined;
}

export interface Lead {
  id: string;
  session_id: string;
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
}

export interface LeadStats {
  totals: {
    total: number;
    new: number;
    in_progress: number;
    sold: number;
    not_sold: number;
    conversion: number | null;
  };
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
  daily: { date: string; count: number }[];
}

export interface SandboxChatMessage {
  role: "user" | "model";
  text: string;
}
