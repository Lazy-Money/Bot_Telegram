import { InlineKeyboard } from "grammy";

/**
 * Fechas como texto ISO "AAAA-MM-DD": se guardan, se comparan y se validan sin ambigüedad
 * día/mes. Todos los cálculos se hacen en UTC sobre esa fecha, así no influye el huso horario.
 */

const TIME_ZONE = "Europe/Copenhagen";
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/** Botón sin contenido visible (Telegram no acepta botones con texto vacío). */
const BLANK = "⠀";

/** Fecha de hoy en Dinamarca. */
export function todayIso(now: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function isValidIso(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromUtc(toUtc(iso)) === iso;
}

/** "2026-11-01" → "01/11/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Mes "AAAA-MM" desplazado `n` meses. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Calendario de un mes con botones. Solo los días entre `min` y `max` (inclusive) se pueden
 * tocar; el resto se muestra como "·". Los callbacks son:
 *   `day:<paso>:<AAAA-MM-DD>`  elegir día
 *   `cal:<paso>:<AAAA-MM>`     cambiar de mes
 *   `noop`                     celdas decorativas
 */
export function calendarKeyboard(
  step: number,
  month: string,
  min: string,
  max: string,
  todayShortcut?: string,
): InlineKeyboard {
  const [y, m] = month.split("-").map(Number);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const kb = new InlineKeyboard();

  kb.text(prev >= monthOf(min) ? "◀" : BLANK, prev >= monthOf(min) ? `cal:${step}:${prev}` : "noop")
    .text(`${MONTHS[m - 1]} ${y}`, "noop")
    .text(next <= monthOf(max) ? "▶" : BLANK, next <= monthOf(max) ? `cal:${step}:${next}` : "noop")
    .row();
  for (const w of WEEKDAYS) kb.text(w, "noop");
  kb.row();

  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay: 0 = domingo. La semana arranca el lunes.
  const offset = (new Date(toUtc(first)).getUTCDay() + 6) % 7;

  const cells: { text: string; data: string }[] = [];
  for (let i = 0; i < offset; i++) cells.push({ text: BLANK, data: "noop" });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const enabled = iso >= min && iso <= max;
    cells.push({ text: enabled ? String(d) : "·", data: enabled ? `day:${step}:${iso}` : "noop" });
  }
  while (cells.length % 7 !== 0) cells.push({ text: BLANK, data: "noop" });

  cells.forEach((cell, i) => {
    kb.text(cell.text, cell.data);
    if (i % 7 === 6) kb.row();
  });

  if (todayShortcut && todayShortcut >= min && todayShortcut <= max) {
    kb.text(`📍 Hoy (${formatDate(todayShortcut).slice(0, 5)})`, `day:${step}:${todayShortcut}`);
  }
  return kb;
}
