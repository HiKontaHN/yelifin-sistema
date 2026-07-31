// lib/import-labels.ts
// Formato compartido entre la plantilla de Excel (cliente) y el parser del
// import (servidor). No importa xlsx ni exceljs — debe poder cargarse en ambos.

export type AccountKind = "account" | "credit_card";

export const MAX_IMPORT_ROWS = 1800;

// La escritura en DB es secuencial fila por fila (varios round-trips SQL
// cada una) — se ejecuta en lotes de este tamaño para que cada request al
// servidor quede muy por debajo del timeout de la función serverless.
export const IMPORT_EXECUTE_CHUNK_SIZE = 100;

export const TEMPLATE_COLUMNS = [
  "sku",
  "nombre",
  "descripcion",
  "precio",
  "cantidad",
  "costo_unitario",
  "fecha",
  "estado",
  "cuenta",
] as const;

export const ESTADO_OPTIONS = ["listo", "pendiente"] as const;
export type ImportEstado = (typeof ESTADO_OPTIONS)[number];

// Labels del dropdown de cuenta: "Nombre (Cuenta)" / "Nombre (Tarjeta)".
// El #id solo se agrega cuando hay nombres duplicados dentro del mismo tipo,
// para que la resolución nunca sea ambigua.
export function buildAccountLabels(
  kind: AccountKind,
  items: { id: number; name: string }[]
): { id: number; label: string }[] {
  const word = kind === "credit_card" ? "Tarjeta" : "Cuenta";
  const nameCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  return items.map((item) => {
    const isDuplicated = (nameCounts.get(item.name.trim().toLowerCase()) ?? 0) > 1;
    return {
      id: item.id,
      label: isDuplicated
        ? `${item.name} (${word} #${item.id})`
        : `${item.name} (${word})`,
    };
  });
}

const ACCOUNT_LABEL_RE = /\((cuenta|tarjeta)(?:\s*#(\d+))?\)\s*$/i;

// Acepta: "Nombre (Cuenta)", "Nombre (Tarjeta #2)" o el nombre a secas
// escrito a mano (kind null → se resuelve por nombre contra ambos listados).
export function parseAccountLabel(raw: string): {
  kind: AccountKind | null;
  id: number | null;
  name: string;
} {
  const trimmed = raw.trim();
  const match = trimmed.match(ACCOUNT_LABEL_RE);
  if (!match) return { kind: null, id: null, name: trimmed };
  return {
    kind: match[1].toLowerCase() === "tarjeta" ? "credit_card" : "account",
    id: match[2] ? Number(match[2]) : null,
    name: trimmed.slice(0, match.index).trim(),
  };
}
