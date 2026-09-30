import { applies, type Category, type Data, type Field } from "./categories.ts";

/** Límite de Telegram para el texto que acompaña a una foto. */
export const MAX_CAPTION = 1024;

export interface Author {
  id: number;
  name: string;
  username?: string;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CURRENCY_WORDS = /(dkk|kroner|kr\.?|coronas?|danesas?)/g;

/**
 * Interpreta un monto escrito por una persona: "8500", "8.500", "8 500 kr", "150,50".
 * Devuelve `undefined` si no es un número positivo (por ejemplo "a consultar").
 */
export function parseNumber(input: string, integer = false): number | undefined {
  const s = input.toLowerCase().replace(CURRENCY_WORDS, "").replace(/,-$/, "").replace(/\s+/g, "");
  if (!/^\d+([.,]\d+)*$/.test(s)) return undefined;

  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let value: number;
  if (lastSep === -1) {
    value = Number(s);
  } else {
    const tail = s.slice(lastSep + 1);
    const head = s.slice(0, lastSep).replace(/[.,]/g, "");
    if (tail.length === 3) {
      // Separador de miles: 8.500 / 1.250.000
      if (!/^\d{1,3}([.,]\d{3})*$/.test(s)) return undefined;
      value = Number(head + tail);
    } else if (tail.length <= 2) {
      value = Number(`${head}.${tail}`);
    } else {
      return undefined;
    }
  }

  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  return value;
}

/** 12500 → "12.500", 150.5 → "150,50" (formato danés, sin depender de Intl). */
export function formatNumber(value: number): string {
  const [int, dec] = (Number.isInteger(value) ? String(value) : value.toFixed(2)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${grouped},${dec}` : grouped;
}

function displayValue(field: Field, value: string | number): string {
  if (field.type === "number" && typeof value === "number") {
    return field.unit ? `${formatNumber(value)} ${field.unit}` : formatNumber(value);
  }
  return String(value);
}

export function authorHtml(author: Author): string {
  const mention = `<a href="tg://user?id=${author.id}">${escapeHtml(author.name)}</a>`;
  return author.username ? `${mention} · @${author.username}` : mention;
}

/** Texto final de la publicación, en HTML de Telegram. */
export function renderPost(category: Category, data: Data, author: Author): string {
  const title = category.title ? category.title(data) : category.label;
  const lines = [`<b>${category.emoji} ${escapeHtml(title)}</b>`];
  if (category.summary) lines.push(escapeHtml(category.summary(data)));
  lines.push("");

  for (const field of category.fields) {
    if (field.type === "photos" || field.hideInPost || !applies(field, data)) continue;
    const value = data[field.key];
    if (value === undefined) continue;
    lines.push(`<b>${escapeHtml(field.label)}:</b> ${escapeHtml(displayValue(field, value))}`);
  }

  lines.push("", `👤 Publicado por ${authorHtml(author)}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
