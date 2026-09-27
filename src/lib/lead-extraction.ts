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
const ROUTE_REGEX = /(?:из|от)\s+([А-ЯЁа-яё\w\s-]+)\s+(?:в|до|ге)\s+([А-ЯЁа-яё\w\s-]+)/i;
const WEIGHT_REGEX = /(\d+(?:[.,]\d+)?)\s*(кг|тонн|т\.?|тон|kg|ton|tonna|t)/i;
const CARGO_KEYWORDS = [
  "одежда",
  "техника",
  "продукты",
  "мебель",
  "стройматериалы",
  "запчасти",
  "оборудование",
  "тольки",
  "salt",
  "соль",
  "tuz",
  "mal",
  "goods",
  "material",
];

export function extractLeadFields(text: string): ExtractedLeadFields {
  const fields: ExtractedLeadFields = {};

  const phoneMatch = text.match(PHONE_REGEX);
  if (phoneMatch) fields.phone = phoneMatch[1].trim();

  const routeMatch = text.match(ROUTE_REGEX);
  if (routeMatch) {
    fields.origin_city = routeMatch[1].trim();
    fields.destination_city = routeMatch[2].trim();
  }

  const weightMatch = text.match(WEIGHT_REGEX);
  if (weightMatch) {
    const number = weightMatch[1];
    const unit = weightMatch[2].toLowerCase();
    // Нормализуем единицы к одному формату
    const normalized = ["тонн", "тон", "ton", "tonna", "t"].includes(unit) ? "т" : "кг";
    fields.weight = `${number} ${normalized}`;
  }

  // Ищем тип груза - улучшенная логика
  const textLower = text.toLowerCase();
  const cargoMatch = CARGO_KEYWORDS.find((kw) => textLower.includes(kw));
  if (cargoMatch) fields.cargo_type = cargoMatch;

  console.log("[Lead Extract Debug]", { text: text.slice(0, 100), fields });
  return fields;
}

export function isLeadComplete(fields: ExtractedLeadFields) {
  return Boolean(
    fields.origin_city && fields.destination_city && fields.weight && fields.phone
  );
}
