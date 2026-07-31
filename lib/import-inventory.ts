// lib/import-inventory.ts
// Parseo, validación y resolución de filas del import masivo por Excel.
// Solo lectura de DB (resolveRows) — las escrituras viven en la route.
import * as XLSX from "xlsx";
import {
  ESTADO_OPTIONS,
  MAX_IMPORT_ROWS,
  parseAccountLabel,
  type AccountKind,
  type ImportEstado,
} from "@/lib/import-labels";

export { MAX_IMPORT_ROWS };

// Firma mínima del tag de Neon — suficiente para las consultas de resolución.
type SqlClient = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Record<string, any>[]>;

export type ImportRow = {
  rowNumber: number; // fila real del Excel (encabezado = 1)
  sku: string | null;
  nombre: string | null;
  descripcion: string | null;
  precio: number | null;
  cantidad: number | null;
  costoUnitario: number | null;
  fecha: string | null; // ISO
  estado: ImportEstado;
  cuentaRaw: string | null;
  cuentaRef: { kind: AccountKind | null; id: number | null; name: string } | null;
  errors: string[];
};

export type ImportAction =
  | "crear"
  | "crear_con_stock"
  | "crear_pendiente"
  | "agregar_stock"
  | "agregar_pendiente"
  | "omitir"
  | "error";

export type ResolvedAccount = { kind: AccountKind; id: number; name: string };

export type ResolvedRow = ImportRow & {
  action: ImportAction;
  productId: number | null;
  variantId: number | null;
  productName: string | null;
  account: ResolvedAccount | null;
  warnings: string[];
};

export type ImportSummary = {
  totalRows: number;
  errorRows: number;
  newProducts: number;
  readyBatches: number;
  pendingPurchases: number;
  purchasesWithPayment: number;
  // Total a debitar por cuenta/tarjeta al ejecutar
  financial: { kind: AccountKind; id: number; name: string; total: number }[];
};

// ── Parseo ──────────────────────────────────────────────────────────────

const normalizeHeader = (s: string) =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");

const HEADER_ALIASES: Record<string, string> = {
  sku: "sku",
  nombre: "nombre",
  descripcion: "descripcion",
  precio: "precio",
  cantidad: "cantidad",
  costo_unitario: "costo_unitario",
  costo: "costo_unitario",
  fecha: "fecha",
  estado: "estado",
  cuenta: "cuenta",
};

function cellToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function cellToNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return parsed;
}

function cellToDate(value: unknown): { iso: string | null; invalid: boolean } {
  if (value === null || value === undefined || String(value).trim() === "")
    return { iso: null, invalid: false };
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? { iso: null, invalid: true }
      : { iso: value.toISOString(), invalid: false };
  }
  const text = String(value).trim();
  // dd/mm/yyyy o dd-mm-yyyy (formato local es-HN)
  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(date.getTime())
      ? { iso: null, invalid: true }
      : { iso: date.toISOString(), invalid: false };
  }
  const parsed = new Date(text);
  return isNaN(parsed.getTime())
    ? { iso: null, invalid: true }
    : { iso: parsed.toISOString(), invalid: false };
}

export function parseWorkbook(buffer: Buffer): { rows: ImportRow[]; error: string | null } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return { rows: [], error: "No se pudo leer el archivo. Debe ser un .xlsx válido." };
  }

  const sheetName = workbook.SheetNames.includes("Productos")
    ? "Productos"
    : workbook.SheetNames.find((n) => !n.startsWith("_") && n !== "Instrucciones");
  if (!sheetName) return { rows: [], error: "El archivo no tiene una hoja de productos." };

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: null, raw: true }
  );

  if (rawRows.length === 0)
    return { rows: [], error: "El archivo no tiene filas de datos." };
  if (rawRows.length > MAX_IMPORT_ROWS)
    return { rows: [], error: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas.` };

  const rows: ImportRow[] = rawRows.map((raw, index) => {
    // Normalizar encabezados a las columnas canónicas
    const record: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const canonical = HEADER_ALIASES[normalizeHeader(key)];
      if (canonical) record[canonical] = value;
    }

    const errors: string[] = [];

    const precio = cellToNumber(record.precio);
    if (precio !== null && (isNaN(precio) || precio < 0))
      errors.push("El precio debe ser un número mayor o igual a 0");

    const cantidad = cellToNumber(record.cantidad);
    if (cantidad !== null && (isNaN(cantidad) || !Number.isInteger(cantidad) || cantidad <= 0))
      errors.push("La cantidad debe ser un número entero mayor a 0");

    const costoUnitario = cellToNumber(record.costo_unitario);
    if (costoUnitario !== null && (isNaN(costoUnitario) || costoUnitario < 0))
      errors.push("El costo unitario debe ser un número mayor o igual a 0");

    const { iso: fecha, invalid: fechaInvalida } = cellToDate(record.fecha);
    if (fechaInvalida) errors.push("La fecha no es válida (usar dd/mm/aaaa)");
    if (fecha && new Date(fecha).getTime() > Date.now())
      errors.push("La fecha no puede ser futura");

    const estadoRaw = cellToString(record.estado)?.toLowerCase() ?? "listo";
    const estado = (ESTADO_OPTIONS as readonly string[]).includes(estadoRaw)
      ? (estadoRaw as ImportEstado)
      : null;
    if (estado === null)
      errors.push(`Estado inválido "${estadoRaw}" (usar listo o pendiente)`);

    const cuentaRaw = cellToString(record.cuenta);
    const cuentaRef = cuentaRaw ? parseAccountLabel(cuentaRaw) : null;

    return {
      rowNumber: index + 2, // +1 por base 1, +1 por el encabezado
      sku: cellToString(record.sku),
      nombre: cellToString(record.nombre),
      descripcion: cellToString(record.descripcion),
      precio: precio !== null && !isNaN(precio) ? precio : null,
      cantidad: cantidad !== null && !isNaN(cantidad) ? cantidad : null,
      costoUnitario: costoUnitario !== null && !isNaN(costoUnitario) ? costoUnitario : null,
      fecha,
      estado: estado ?? "listo",
      cuentaRaw,
      cuentaRef,
      errors,
    };
  });

  return { rows, error: null };
}

// ── Validaciones puras (sin DB) ─────────────────────────────────────────

export function validateRows(rows: ImportRow[]): void {
  // Requisitos cruzados por fila
  for (const row of rows) {
    if (row.cantidad !== null && row.costoUnitario === null)
      row.errors.push("El costo unitario es requerido cuando hay cantidad");
    if (!row.sku && !row.nombre)
      row.errors.push("La fila necesita un SKU o un nombre de producto");
  }

  // SKUs duplicados dentro del archivo
  const bySku = new Map<string, ImportRow[]>();
  for (const row of rows) {
    if (!row.sku) continue;
    const key = row.sku.toLowerCase();
    const list = bySku.get(key) ?? [];
    list.push(row);
    bySku.set(key, list);
  }
  for (const list of bySku.values()) {
    if (list.length < 2) continue;
    const fileRows = list.map((r) => r.rowNumber).join(", ");
    for (const row of list)
      row.errors.push(`SKU duplicado en el archivo (filas ${fileRows})`);
  }
}

// ── Resolución contra la DB ─────────────────────────────────────────────

export async function resolveRows(
  rows: ImportRow[],
  orgId: number,
  sql: SqlClient
): Promise<ResolvedRow[]> {
  const skus = [...new Set(rows.filter((r) => r.sku).map((r) => r.sku as string))];

  const products = skus.length
    ? await sql`
        SELECT p.id, p.sku, p.name, p.is_service,
          EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv.product_id = p.id AND pv.is_active = TRUE
          ) AS has_variants
        FROM products p
        WHERE p.org_id = ${orgId} AND p.is_active = TRUE AND p.sku = ANY(${skus})
      `
    : [];
  const productBySku = new Map(products.map((p) => [String(p.sku).toLowerCase(), p]));

  const variants = skus.length
    ? await sql`
        SELECT pv.id, pv.sku, pv.product_id, pv.variant_name, p.name AS product_name
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id AND p.is_active = TRUE
        WHERE pv.org_id = ${orgId} AND pv.is_active = TRUE AND pv.sku = ANY(${skus})
      `
    : [];
  const variantBySku = new Map(variants.map((v) => [String(v.sku).toLowerCase(), v]));

  // Cuentas y tarjetas de la org (pocas por org — se resuelve en memoria,
  // por id cuando el label lo trae y por nombre cuando fue escrito a mano)
  const hasAccountRefs = rows.some((r) => r.cuentaRef !== null);
  const accounts = hasAccountRefs
    ? await sql`
        SELECT id, name FROM accounts
        WHERE org_id = ${orgId} AND is_active = TRUE
      `
    : [];
  const cards = hasAccountRefs
    ? await sql`
        SELECT id, name FROM credit_cards
        WHERE org_id = ${orgId} AND is_active = TRUE
      `
    : [];

  const findAccount = (ref: NonNullable<ImportRow["cuentaRef"]>):
    | { ok: true; account: ResolvedAccount }
    | { ok: false; error: string } => {
    const pools: { kind: AccountKind; items: Record<string, any>[] }[] = [];
    if (ref.kind === null || ref.kind === "account") pools.push({ kind: "account", items: accounts });
    if (ref.kind === null || ref.kind === "credit_card") pools.push({ kind: "credit_card", items: cards });

    const matches: ResolvedAccount[] = [];
    for (const pool of pools) {
      for (const item of pool.items) {
        const sameId = ref.id !== null && Number(item.id) === ref.id;
        const sameName =
          ref.id === null &&
          String(item.name).trim().toLowerCase() === ref.name.trim().toLowerCase();
        if (sameId || sameName)
          matches.push({ kind: pool.kind, id: Number(item.id), name: String(item.name) });
      }
    }

    if (matches.length === 1) return { ok: true, account: matches[0] };
    if (matches.length > 1)
      return {
        ok: false,
        error: `"${ref.name}" es ambiguo — hay más de una cuenta/tarjeta con ese nombre; seleccionala del listado de la plantilla`,
      };
    return {
      ok: false,
      error: `La cuenta "${ref.name}" no existe o está inactiva — seleccionala del listado de la plantilla`,
    };
  };

  // Unidades ya pendientes de llegar (para advertir doble conteo)
  const matchedProductIds = [
    ...new Set([
      ...products.map((p) => Number(p.id)),
      ...variants.map((v) => Number(v.product_id)),
    ]),
  ];
  const pendingUnits = matchedProductIds.length
    ? await sql`
        SELECT pbi.product_id, pbi.variant_id, pb.id AS purchase_id,
               SUM(pbi.quantity)::int AS qty
        FROM purchase_batch_items pbi
        JOIN purchase_batches pb ON pb.id = pbi.purchase_batch_id
        WHERE pb.org_id = ${orgId}
          AND pb.status = 'PENDING'
          AND pbi.product_id = ANY(${matchedProductIds})
        GROUP BY pbi.product_id, pbi.variant_id, pb.id
      `
    : [];
  const pendingKey = (productId: number, variantId: number | null) =>
    `${productId}:${variantId ?? "null"}`;
  const pendingByTarget = new Map<string, { purchaseId: number; qty: number }[]>();
  for (const p of pendingUnits) {
    const key = pendingKey(Number(p.product_id), p.variant_id ? Number(p.variant_id) : null);
    const list = pendingByTarget.get(key) ?? [];
    list.push({ purchaseId: Number(p.purchase_id), qty: Number(p.qty) });
    pendingByTarget.set(key, list);
  }

  return rows.map((row): ResolvedRow => {
    const errors = [...row.errors];
    const warnings: string[] = [];
    let productId: number | null = null;
    let variantId: number | null = null;
    let productName: string | null = null;
    let isNew = false;

    const skuKey = row.sku?.toLowerCase() ?? null;
    const matchedProduct = skuKey ? productBySku.get(skuKey) : undefined;
    const matchedVariant = !matchedProduct && skuKey ? variantBySku.get(skuKey) : undefined;

    if (matchedProduct) {
      productId = Number(matchedProduct.id);
      productName = String(matchedProduct.name);
      if (row.cantidad !== null) {
        if (matchedProduct.is_service)
          errors.push(`"${productName}" es un servicio y no puede tener inventario`);
        if (matchedProduct.has_variants)
          errors.push(
            `"${productName}" tiene variantes — usar el SKU de la variante, no el del producto`
          );
      }
    } else if (matchedVariant) {
      productId = Number(matchedVariant.product_id);
      variantId = Number(matchedVariant.id);
      productName = `${matchedVariant.product_name} — ${matchedVariant.variant_name}`;
    } else if (row.sku || row.nombre) {
      // Producto nuevo (con SKU explícito o autogenerado)
      isNew = true;
      productName = row.nombre;
      if (!row.nombre) errors.push(`El SKU "${row.sku}" no existe y la fila no trae nombre para crearlo`);
      if (row.precio === null) errors.push("El precio es requerido para crear un producto");
    }

    // Cuenta / tarjeta
    let account: ResolvedAccount | null = null;
    if (row.cuentaRef && row.cantidad !== null) {
      const found = findAccount(row.cuentaRef);
      if (found.ok) account = found.account;
      else errors.push(found.error);
    } else if (row.cuentaRef && row.cantidad === null) {
      warnings.push("La cuenta se ignora porque la fila no tiene cantidad");
    }

    // Advertencia de unidades ya pendientes
    if (row.cantidad !== null && productId !== null && errors.length === 0) {
      const pending = pendingByTarget.get(pendingKey(productId, variantId)) ?? [];
      for (const p of pending) {
        warnings.push(
          row.estado === "listo"
            ? `Tiene ${p.qty} unidades pendientes de llegar en la compra #${p.purchaseId} — no las incluyas aquí o se duplicarán al completarla`
            : `Ya tiene ${p.qty} unidades pendientes en la compra #${p.purchaseId}`
        );
      }
    }

    // Acción final
    let action: ImportAction;
    if (errors.length > 0) {
      action = "error";
    } else if (row.cantidad === null) {
      action = isNew ? "crear" : "omitir";
      if (action === "omitir")
        warnings.push("El producto ya existe y la fila no trae cantidad — no se hace nada");
    } else if (isNew) {
      action = row.estado === "pendiente" ? "crear_pendiente" : "crear_con_stock";
    } else {
      action = row.estado === "pendiente" ? "agregar_pendiente" : "agregar_stock";
    }

    return { ...row, errors, warnings, action, productId, variantId, productName, account };
  });
}

// ── Resumen (conteos + impacto financiero por cuenta) ───────────────────

export function summarizeRows(rows: ResolvedRow[]): ImportSummary {
  const financial = new Map<string, ImportSummary["financial"][number]>();
  let newProducts = 0;
  let readyBatches = 0;
  let pendingPurchases = 0;
  let purchasesWithPayment = 0;
  let errorRows = 0;

  for (const row of rows) {
    if (row.action === "error") {
      errorRows++;
      continue;
    }
    if (row.action === "crear" || row.action === "crear_con_stock" || row.action === "crear_pendiente")
      newProducts++;
    if (row.action === "crear_con_stock" || row.action === "agregar_stock") readyBatches++;
    if (row.action === "crear_pendiente" || row.action === "agregar_pendiente") pendingPurchases++;

    if (row.account && row.cantidad !== null && row.costoUnitario !== null) {
      purchasesWithPayment++;
      const key = `${row.account.kind}:${row.account.id}`;
      const entry = financial.get(key) ?? { ...row.account, total: 0 };
      entry.total += row.cantidad * row.costoUnitario;
      financial.set(key, entry);
    }
  }

  return {
    totalRows: rows.length,
    errorRows,
    newProducts,
    readyBatches,
    pendingPurchases,
    purchasesWithPayment,
    financial: [...financial.values()],
  };
}
