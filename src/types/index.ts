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
}

/** Version of Account safe to send to the browser — token is masked. */
export interface AccountPublic extends Omit<Account, "access_token"> {
  access_token_preview: string;
}

export type RuleType = "tone" | "qualification_requirements" | "general";

export interface SystemRule {
  id: string;
  rule_type: RuleType;
  title: string;
  rule_text: string;
  is_active: boolean;
}

export interface KnowledgeItem {
  id: string;
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

export type LeadStatus = "pending_quote" | "quoted" | "closed";

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
  quote_price: number | null;
  status: LeadStatus;
  created_at: string;
}

export interface SandboxChatMessage {
  role: "user" | "model";
  text: string;
}
