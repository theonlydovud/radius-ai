/**
 * Проверка полей заявки. Сами поля извлекает Gemini (extractLeadFieldsWithGemini):
 * раньше первыми работали регулярки, и они ловили мусор вроде «Toshkent → unitaz»
 * (любой дефис или окончание «-ga» считались маршрутом) или «yuk» как тип груза.
 * Здесь — последняя линия обороны: даже если модель ошиблась, мусорное поле
 * обнуляется, и заявка не создаётся, пока клиент не назовёт данные нормально.
 */

export interface ExtractedLeadFields {
  /** Клиент действительно хочет перевезти груз (а не болтает/спрашивает не по теме). */
  is_cargo_request?: boolean;
  origin_city?: string;
  destination_city?: string;
  weight?: string;
  cargo_type?: string;
  phone?: string;
}

const PHONE_REGEX = /\+?\d[\d\s\-()]{6,}\d/;

// Слова, которые сами по себе ничего не говорят о грузе.
const GENERIC_CARGO = new Set([
  "yuk", "yuklar", "yukim", "юк", "груз", "грузы", "груза", "товар", "товары", "cargo", "goods",
  "mal", "mallar", "mahsulot", "mahsulotlar", "narsa", "narsalar", "вещи", "нарса", "посылка", "posilka",
]);

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || /^(null|none|undefined|нет|—|-)$/i.test(v)) return undefined;
  return v;
}

/** Похоже на название места: буквы, без цифр, разумная длина. */
function plausiblePlace(value: string | undefined) {
  if (!value) return undefined;
  if (value.length < 2 || value.length > 50) return undefined;
  if (/\d/.test(value) || !/\p{L}/u.test(value)) return undefined;
  return value;
}

/** Телефон из сообщений клиента — запасной вариант, если модель номер не вернула. */
export function extractPhone(text: string): string | undefined {
  return text.match(PHONE_REGEX)?.[0].replace(/[\s\-()]/g, "");
}

export function sanitizeLeadFields(raw: Partial<Record<keyof ExtractedLeadFields, unknown>>): ExtractedLeadFields {
  const origin = plausiblePlace(clean(raw.origin_city));
  let destination = plausiblePlace(clean(raw.destination_city));
  if (origin && destination && origin.toLowerCase() === destination.toLowerCase()) destination = undefined;

  const weight = clean(raw.weight);
  let cargo = clean(raw.cargo_type);
  if (cargo && (cargo.length < 3 || GENERIC_CARGO.has(cargo.toLowerCase()))) cargo = undefined;
  // Груз, указанный как город (или наоборот), — явная ошибка разбора.
  if (cargo && [origin, destination].some((p) => p && p.toLowerCase() === cargo!.toLowerCase())) cargo = undefined;

  const phoneRaw = clean(raw.phone);
  const digits = phoneRaw?.replace(/\D/g, "") ?? "";
  const phone = digits.length >= 7 && digits.length <= 15 ? phoneRaw : undefined;

  return {
    is_cargo_request: raw.is_cargo_request === true,
    origin_city: origin,
    destination_city: destination,
    weight: weight && /\d/.test(weight) ? weight : undefined,
    cargo_type: cargo,
    phone,
  };
}

/**
 * Заявка создаётся по тем же правилам, по которым бот говорит клиенту «передал логисту»:
 * маршрут, телефон и характеристики груза — вес/объём ИЛИ что везём.
 * Раньше требовались оба поля: клиент, назвавший только вес, слышал «логист свяжется»,
 * а заявка не создавалась.
 */
export function isLeadComplete(fields: ExtractedLeadFields) {
  return Boolean(
    fields.is_cargo_request &&
      fields.origin_city &&
      fields.destination_city &&
      (fields.weight || fields.cargo_type) &&
      fields.phone
  );
}

// ---------------------------------------------------------------------
// Заявка «что хочет клиент» — для компаний не из логистики (lead_kind = generic)
// ---------------------------------------------------------------------

export interface GenericLeadFields {
  is_lead?: boolean;
  /** Что хочет клиент, коротко по-русски. */
  request?: string;
  phone?: string;
}

export function sanitizeGenericLead(raw: Partial<Record<keyof GenericLeadFields, unknown>>): GenericLeadFields {
  const request = clean(raw.request);
  const phoneRaw = clean(raw.phone);
  const digits = phoneRaw?.replace(/\D/g, "") ?? "";
  return {
    is_lead: raw.is_lead === true,
    request: request && request.length >= 3 ? request.slice(0, 300) : undefined,
    phone: digits.length >= 7 && digits.length <= 15 ? phoneRaw : undefined,
  };
}

export function isGenericLeadComplete(fields: GenericLeadFields) {
  return Boolean(fields.is_lead && fields.request && fields.phone);
}
