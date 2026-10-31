import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Время сообщения с секундами: видно, через сколько ответил бот. */
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Ключ дня в локальном времени — для разделителей в переписке. */
export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** «Сегодня», «Вчера» или «25 октября» (год — только если не текущий). */
export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Сегодня";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

/** Дата для <input type="date"> (YYYY-MM-DD) в местном времени. */
export function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Начало и конец дня из <input type="date"> в местном времени — как ISO для API. */
export function dayStartISO(day: string) {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function dayEndISO(day: string) {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
