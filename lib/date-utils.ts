// lib/date-utils.ts

/**
 * Converts a "YYYY-MM-DD" string from <input type="date"> to an ISO timestamp
 * using the current browser time for the time portion, so the record is stored
 * at the actual local moment the user submits the form.
 */
export function localDateToISO(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const now = new Date();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

/**
 * Converts a Date object or ISO string to "YYYY-MM-DD" using the browser's
 * LOCAL timezone. Use this to populate <input type="date"> from stored data.
 */
export function toLocalDateInput(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Estado de eventos (PLANNED/ACTIVE/COMPLETED) ────────────────────────
// El timestamp guardado en starts_at/ends_at carga la hora del momento en
// que se creó el evento (ver localDateToISO), no medianoche — comparar por
// timestamp exacto hace que un evento "termine" a media tarde el mismo día
// en que en realidad debería seguir ACTIVE. Se reduce todo a fecha-only
// (día calendario en UTC) antes de comparar para evitar eso.
function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type SimpleEventStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

export function computeEventStatus(
  startsAt: string | Date,
  endsAt:   string | Date,
  now:      Date = new Date()
): SimpleEventStatus {
  const today = dateOnlyUTC(now);
  const start = dateOnlyUTC(typeof startsAt === "string" ? new Date(startsAt) : startsAt);
  const end   = dateOnlyUTC(typeof endsAt   === "string" ? new Date(endsAt)   : endsAt);
  if (today < start) return "PLANNED";
  if (today <= end)  return "ACTIVE";
  return "COMPLETED";
}
