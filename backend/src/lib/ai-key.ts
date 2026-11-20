import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "./supabase/server";

/**
 * Свой ключ Gemini у компании (companies.settings.ai = { key_enc, model }).
 * Ключ хранится зашифрованным (AES-256-GCM), в браузер не уходит. Нет своего ключа
 * или его не расшифровать — компания работает на общем ключе (GOOGLE_GEMINI_API_KEY).
 * Модель своя, потому что на новых проектах Google старые модели недоступны.
 */

export type CompanyAi = { client: GoogleGenerativeAI; model: string; own: boolean };

// Ключ шифрования выводится из service role key: он одинаков везде, где есть доступ к этой базе.
function cipherKey() {
  return createHash("sha256").update(`dexa-ai-key:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest();
}

export function encryptAiKey(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptAiKey(enc: string): string | null {
  try {
    const [v, iv, tag, data] = enc.split(".");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; value: CompanyAi | null }>();
const CACHE_MS = 60_000;

/** Свой ИИ компании или null — тогда используется общий ключ и общая модель. */
export async function companyAi(companyId: string | null | undefined): Promise<CompanyAi | null> {
  if (!companyId) return null;
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: CompanyAi | null = null;
  const { data } = await createAdminClient().from("companies").select("settings").eq("id", companyId).maybeSingle();
  const ai = (data?.settings as any)?.ai;
  if (ai?.key_enc) {
    const key = decryptAiKey(String(ai.key_enc));
    if (key) value = { client: new GoogleGenerativeAI(key), model: String(ai.model || "gemini-3.5-flash-lite"), own: true };
    else console.error(`[ai] свой ключ компании ${companyId.slice(0, 8)} не расшифровать — работаю на общем ключе`);
  }
  cache.set(companyId, { at: Date.now(), value });
  return value;
}

/** Есть ли у компании свой ключ и расшифровывается ли он (для «Настроек», без самого ключа). */
export async function companyAiStatus(companyId: string): Promise<"shared" | "own" | "broken"> {
  const { data } = await createAdminClient().from("companies").select("settings").eq("id", companyId).maybeSingle();
  const enc = (data?.settings as any)?.ai?.key_enc;
  if (!enc) return "shared";
  return decryptAiKey(String(enc)) ? "own" : "broken";
}
