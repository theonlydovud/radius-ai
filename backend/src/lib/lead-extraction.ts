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

const PHONE_REGEX = /(?:\+?\d[\d\s\-()]{8,}\d)/;
const ROUTE_REGEXES = [
  /(?:iz|ot|from|dan|с|из|от)\s+([A-Za-zА-ЯЁа-яё\w\s-]+?)\s+(?:v|to|ga|gacha|до|в|к|dan|кеч|тў|towards|to)\s+([A-Za-zА-ЯЁа-яё\w\s-]+)/i,
  /(?:from|dan|из|от)\s+([A-Za-zА-ЯЁа-яё\w\s-]+?)\s*(?:to|ga|gacha|до|в|к)\s*([A-Za-zА-ЯЁа-яё\w\s-]+)/i,
  /([A-Za-zА-ЯЁа-яё\w\s-]+?)\s*(?:->|→|—|-)\s*([A-Za-zА-ЯЁа-яё\w\s-]+)/i,
];
const WEIGHT_REGEX = /(\d+(?:[.,]\d+)?)\s*(кг|кгм|тонн|тон|т|kg|kilo|kilogramm|tonna|ton|t)/i;
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
  "kiyim",
  "texnika",
  "mahsulot",
  "mebel",
  "qurilish",
  "zapas",
  "jihoz",
  "yuk",
  "mashina",
  "texnik",
  "elektronika",
  "oziq-ovqat",
  "qurilish materiallari",
];

function normalizeLeadText(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "")
    .trim();
}

export function extractLeadFields(text: string): ExtractedLeadFields {
  const fields: ExtractedLeadFields = {};
  const normalized = normalizeLeadText(text);

  const phoneMatch = text.match(PHONE_REGEX) ?? normalized.match(/(?:\+?998[\d\s\-()]{9,}|\+?\d[\d\s\-()]{8,}\d)/);
  if (phoneMatch) fields.phone = phoneMatch[0].replace(/\s+/g, "").trim();

  for (const routeRegex of ROUTE_REGEXES) {
    const routeMatch = text.match(routeRegex) ?? normalized.match(routeRegex);
    if (routeMatch) {
      const origin = routeMatch[1]?.trim();
      const destination = routeMatch[2]?.trim();
      if (origin && destination) {
        fields.origin_city = origin.replace(/\s+/g, " ").trim();
        fields.destination_city = destination.replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  const weightMatch = text.match(WEIGHT_REGEX) ?? normalized.match(WEIGHT_REGEX);
  if (weightMatch) {
    const number = weightMatch[1];
    const unit = weightMatch[2].toLowerCase();
    const normalizedUnit = ["тонн", "тон", "т", "ton", "tonna", "t"].includes(unit) ? "т" : "кг";
    fields.weight = `${number} ${normalizedUnit}`;
  }

  const textLower = normalized;
  const cargoMatch = CARGO_KEYWORDS.find((kw) => textLower.includes(kw.toLowerCase()));
  if (cargoMatch) fields.cargo_type = cargoMatch;

  console.log("[Lead Extract Debug]", { text: text.slice(0, 120), fields });
  return fields;
}

export function isLeadComplete(fields: ExtractedLeadFields) {
  return Boolean(
    fields.origin_city && fields.destination_city && fields.weight && fields.phone
  );
}
