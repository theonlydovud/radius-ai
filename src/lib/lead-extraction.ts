/**
 * Лёгкая эвристическая экстракция полей заявки из текста диалога.
 * Это намеренно простая реализация без внешних вызовов ИИ — для
 * продакшна её стоит заменить на structured output от Gemini
 * (см. buildSystemInstruction + JSON-схему ответа), но для вебхуков
 * этого достаточно, чтобы понять, когда лид готов к передаче логисту.
 */

export interface ExtractedLeadFields {
  origin_city?: string;
  destination_city?: string;
  weight?: string;
  cargo_type?: string;
  phone?: string;
}

const PHONE_REGEX = /(\+?\d[\d\s\-()]{8,}\d)/;
const ROUTE_REGEX = /из\s+([А-ЯЁа-яё\w-]+)\s+(?:в|до)\s+([А-ЯЁа-яё\w-]+)/i;
const WEIGHT_REGEX = /(\d+(?:[.,]\d+)?)\s*(кг|тонн|т\.?|kg|ton)/i;
const CARGO_KEYWORDS = [
  "одежда",
  "техника",
  "продукты",
  "мебель",
  "стройматериалы",
  "запчасти",
  "оборудование",
];

export function extractLeadFields(text: string): ExtractedLeadFields {
  const fields: ExtractedLeadFields = {};

  const phoneMatch = text.match(PHONE_REGEX);
  if (phoneMatch) fields.phone = phoneMatch[1].trim();

  const routeMatch = text.match(ROUTE_REGEX);
  if (routeMatch) {
    fields.origin_city = routeMatch[1];
    fields.destination_city = routeMatch[2];
  }

  const weightMatch = text.match(WEIGHT_REGEX);
  if (weightMatch) fields.weight = `${weightMatch[1]} ${weightMatch[2]}`;

  const cargoMatch = CARGO_KEYWORDS.find((kw) => text.toLowerCase().includes(kw));
  if (cargoMatch) fields.cargo_type = cargoMatch;

  return fields;
}

export function isLeadComplete(fields: ExtractedLeadFields) {
  return Boolean(
    fields.origin_city && fields.destination_city && fields.weight && fields.phone
  );
}
