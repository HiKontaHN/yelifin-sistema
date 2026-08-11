// types/inventory-batch.ts

// ── Exportar plantilla ─────────────────────────────────────────────────

export interface BatchExportRequest {
  productIds: number[];
}

// ── Resultado del import ───────────────────────────────────────────────

export interface BatchImportErrorDetail {
  fila: number;
  error: string;
}

export interface BatchImportResult {
  procesados: number;
  productos_creados: number;
  errores: BatchImportErrorDetail[];
}

// ── Fila parseada del Excel para preview (UI) ──────────────────────────
// Los campos de datos raw pueden venir como string, number o null desde xlsx

export interface BatchPreviewRow {
  fila: number;
  sku: string;
  nombre_producto: string;
  variante_id: string | null;
  nombre_variante: string | null;
  cantidad: unknown;
  precio_unitario: unknown;
  moneda: string;
  cuenta: string | null;
  tipo_cambio: unknown;
  fecha: string;
  notas: string | null;
  valido: boolean;
  error_local?: string;
}
