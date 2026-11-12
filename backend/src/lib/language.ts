/**
 * Язык ответа бота = язык клиента. Это правило главнее правил аккаунта: раньше правило
 * Radius «основной язык — узбекский» заставляло бота отвечать англоязычному клиенту
 * по-узбекски. Язык определяем сами по последним сообщениям клиента и прямо говорим
 * модели, на каком языке отвечать; если не понятно — общее правило «как пишет клиент».
 */

export type ClientLanguage = "ru" | "uz-latn" | "uz-cyrl" | "en";

const words = (text: string) => text.toLowerCase().match(/[\p{L}'ʻʼ‘’`]+/gu) ?? [];

// Узбекская латиница: характерные буквосочетания, слова и окончания.
const UZ_LATIN_WORDS = new Set([
  "salom", "assalomu", "alaykum", "assalom", "rahmat", "raxmat", "kerak", "qancha", "qanaqa", "nima", "nimaga", "yuk", "yuklar",
  "bor", "yo'q", "yoq", "bormi", "kerakmi", "iltimos", "men", "siz", "sizlar", "biz", "bu", "shu", "u", "ha", "xa", "yaxshi",
  "narxi", "narx", "qayerdan", "qayerga", "qachon", "qanday", "necha", "tonna", "bilan", "uchun", "va", "ham", "emas", "edi",
  "mumkin", "kerakli", "olib", "kelish", "jo'natish", "manzil", "aka", "opa", "xop", "xo'p", "mayli", "ok", "tel", "nomer",
]);
const UZ_LATIN_SUFFIX = /(dan|ga|da|ni|mi|lar|ning|miz|ingiz|yapti|moqchi|sizmi|kerak)$/;

const EN_WORDS = new Set([
  "the", "a", "an", "i", "you", "is", "are", "am", "was", "were", "be", "need", "want", "would", "like", "from", "to", "have",
  "has", "do", "does", "did", "what", "how", "much", "many", "price", "cost", "hello", "hi", "hey", "please", "call", "me",
  "we", "will", "my", "your", "can", "could", "ship", "shipping", "cargo", "truck", "trucks", "thanks", "thank", "yes", "no",
  "of", "for", "in", "on", "at", "with", "and", "or", "this", "that", "it", "there", "here", "where", "when", "send", "tomorrow",
  "today", "address", "office", "every", "day", "time", "long", "good", "ok", "okay", "sir", "about", "know", "tell",
]);

const RU_WORDS = new Set([
  "здравствуйте", "привет", "добрый", "день", "вечер", "мне", "нужно", "надо", "хочу", "сколько", "стоит", "цена", "груз",
  "из", "в", "на", "и", "что", "как", "это", "есть", "можно", "пожалуйста", "спасибо", "да", "нет", "у", "вас", "я", "мы",
]);
const UZ_CYRILLIC_WORDS = new Set([
  "ассалому", "алайкум", "салом", "рахмат", "керак", "қанча", "нима", "юк", "бор", "йўқ", "борми", "илтимос", "мен", "сиз",
  "нархи", "қаердан", "қаерга", "қачон", "қандай", "неча", "тонна", "билан", "учун", "ва", "ҳам", "мумкин", "яхши", "хоп",
]);

/** Язык одного текста или null, если по нему не понять (цифры, «ok», стикер). */
export function detectLanguage(text: string): ClientLanguage | null {
  const w = words(text);
  if (!w.length) return null;

  const cyr = w.filter((x) => /[Ѐ-ӿ]/.test(x));
  const lat = w.filter((x) => /^[a-z'ʻʼ‘’`]+$/.test(x));

  if (cyr.length > lat.length) {
    // Узбекская кириллица: ў қ ғ ҳ или узнаваемые слова.
    if (/[ўқғҳ]/i.test(text) || cyr.some((x) => UZ_CYRILLIC_WORDS.has(x))) {
      const ru = cyr.filter((x) => RU_WORDS.has(x)).length;
      const uz = cyr.filter((x) => UZ_CYRILLIC_WORDS.has(x)).length + (/[ўқғҳ]/i.test(text) ? 2 : 0);
      return uz >= ru ? "uz-cyrl" : "ru";
    }
    return "ru";
  }
  if (!lat.length) return null;

  // o' g' oʻ gʻ — почти наверняка узбекский.
  const uzMarks = (text.match(/[og][''ʻʼ‘’`]/gi) ?? []).length;
  let uz = uzMarks * 2;
  let en = 0;
  for (const x of lat) {
    const n = x.replace(/[ʻʼ‘’`]/g, "'");
    if (UZ_LATIN_WORDS.has(n)) uz += 1;
    else if (n.length > 4 && UZ_LATIN_SUFFIX.test(n) && !EN_WORDS.has(n)) uz += 0.5;
    if (EN_WORDS.has(n)) en += 1;
    // Сочетания, которых нет в английских словах, но частые в узбекских: q без u, x между гласными, sh/ch + гласная в начале.
    if (/q(?!u)/.test(n)) uz += 0.5;
  }
  if (uz === 0 && en === 0) return null;
  if (en > uz) return "en";
  if (uz > en) return "uz-latn";
  return null;
}

/** Язык клиента: по последнему сообщению, а если по нему не понять — по предыдущим. */
export function clientLanguage(latest: string, history: { role: string; text: string }[] = []): ClientLanguage | null {
  const own = detectLanguage(latest);
  if (own) return own;
  const previous = history.filter((h) => h.role === "user").map((h) => h.text).reverse();
  for (const text of previous.slice(0, 6)) {
    const lang = detectLanguage(text);
    if (lang) return lang;
  }
  return null;
}

const NAME: Record<ClientLanguage, string> = {
  ru: "на русском языке",
  "uz-latn": "на узбекском языке латиницей",
  "uz-cyrl": "на узбекском языке кириллицей",
  en: "на английском языке (in English)",
};

const SHORT: Record<ClientLanguage, string> = {
  ru: "Reply in Russian only.",
  "uz-latn": "Reply in Uzbek (Latin script) only.",
  "uz-cyrl": "Reply in Uzbek (Cyrillic script) only.",
  en: "Reply in English only.",
};

/**
 * Пометка к последнему сообщению клиента, которое уходит в модель (в базу не пишется).
 * Системную инструкцию модель на длинных узбекских правилах всё равно иногда забывала;
 * указание в самом сообщении она соблюдает.
 */
export function withLanguageHint(latest: string, history: { role: string; text: string }[] = []) {
  const lang = clientLanguage(latest, history);
  return lang ? `${latest}\n\n[${SHORT[lang]}]` : latest;
}

/** Добавляется в самый конец системной инструкции — после правил аккаунта, чтобы перекрыть их. */
export function replyLanguageRule(latest: string, history: { role: string; text: string }[] = []) {
  const lang = clientLanguage(latest, history);
  const base = `## ЯЗЫК ОТВЕТА — главнее любых правил выше
- Отвечай на том языке, на котором пишет клиент, и тем же алфавитом. Клиент перешёл на другой язык — переходи вслед за ним.
- Правила выше вроде «основной язык — узбекский» или «первый ответ — на узбекском» действуют, только если язык клиента правда не понять (одно «ok», стикер, только цифры).
- Факты из базы знаний и готовые фразы из правил (например «Передаю менеджеру, он свяжется с вами») переводи на язык клиента — не копируй их на языке правил.
- Если последнее сообщение клиента — только номер телефона, цифры или стикер, отвечай на языке его предыдущих сообщений.
- Не смешивай языки в одном сообщении.`;
  return lang ? `${base}\n- Клиент пишет ${NAME[lang]}. Весь ответ — только ${NAME[lang]}.` : base;
}
