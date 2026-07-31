// components/inventory/import-excel-modal.tsx
// Modal de importación masiva por Excel: plantilla (vacía o con productos
// registrados) → subir archivo → preview del dry-run → confirmar → reporte.
"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileSpreadsheet, Download, Upload, ArrowLeft, CheckCircle2,
  XCircle, AlertTriangle, Clock, ExternalLink,
} from "lucide-react";

import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { FeatureGate } from "@/components/shared/feature-gate";
import { SearchBar } from "@/components/shared/search-bar";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/swr/use-currency";
import type { Product } from "@/types";
import type { Account } from "@/hooks/swr/use-accounts";
import type { CreditCard } from "@/hooks/swr/use-credit-cards";
import { downloadImportTemplate, type TemplateProductRow } from "@/lib/export-template";
import { MAX_IMPORT_ROWS, IMPORT_EXECUTE_CHUNK_SIZE } from "@/lib/import-labels";

// ── Tipos de la respuesta del endpoint ─────────────────────────────────

type DryRunRow = {
  rowNumber: number;
  sku: string | null;
  nombre: string | null;
  productName: string | null;
  cantidad: number | null;
  costoUnitario: number | null;
  estado: "listo" | "pendiente";
  account: { kind: "account" | "credit_card"; id: number; name: string } | null;
  action: string;
  errors: string[];
  warnings: string[];
};

type ImportSummary = {
  totalRows: number;
  errorRows: number;
  newProducts: number;
  readyBatches: number;
  pendingPurchases: number;
  purchasesWithPayment: number;
  financial: { kind: string; id: number; name: string; total: number }[];
};

type RowResult = {
  rowNumber: number;
  sku: string | null;
  productName: string | null;
  action: string;
  status: "ok" | "failed";
  error?: string;
  purchaseId?: number;
};

const ACTION_BADGES: Record<string, { label: string; className: string }> = {
  crear:             { label: "Crear producto",  className: "bg-blue-100 text-blue-700 border-blue-200" },
  crear_con_stock:   { label: "Crear + stock",   className: "bg-green-100 text-green-700 border-green-200" },
  crear_pendiente:   { label: "Crear + pendiente", className: "bg-amber-100 text-amber-700 border-amber-200" },
  agregar_stock:     { label: "Agregar stock",   className: "bg-green-100 text-green-700 border-green-200" },
  agregar_pendiente: { label: "Pendiente",       className: "bg-amber-100 text-amber-700 border-amber-200" },
  omitir:            { label: "Sin cambios",     className: "bg-muted text-muted-foreground" },
  error:             { label: "Error",           className: "bg-red-100 text-red-700 border-red-200" },
};

const PREVIEW_PAGE_SIZE = 50;

type Step = "template" | "upload" | "preview" | "report";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  accounts: Account[];
  creditCards: CreditCard[];
  onSuccess: () => void;
};

export function ImportExcelModal({
  open, onOpenChange, products, accounts, creditCards, onSuccess,
}: Props) {
  const { firebaseUser } = useAuth();
  const { format } = useCurrency();

  const [step, setStep] = useState<Step>("template");
  const [showSelector, setShowSelector] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<DryRunRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [results, setResults] = useState<RowResult[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Selector de productos registrados (una entrada por variante) ─────
  // Solo entradas con SKU: sin SKU el archivo crearía un duplicado.
  const selectorEntries = useMemo(() => {
    const entries: { key: string; row: TemplateProductRow; group: string }[] = [];
    for (const product of products) {
      if (product.is_service) continue;
      if (product.variants.length > 0) {
        for (const variant of product.variants) {
          if (!variant.sku) continue;
          entries.push({
            key: `v${variant.id}`,
            group: product.name,
            row: {
              sku: variant.sku,
              nombre: `${product.name} — ${variant.variant_name}`,
              precio: variant.price_override ?? product.price,
            },
          });
        }
      } else if (product.sku) {
        entries.push({
          key: `p${product.id}`,
          group: product.name,
          row: { sku: product.sku, nombre: product.name, precio: product.price },
        });
      }
    }
    return entries;
  }, [products]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return selectorEntries;
    return selectorEntries.filter(
      (e) =>
        e.row.nombre.toLowerCase().includes(query) ||
        e.row.sku.toLowerCase().includes(query)
    );
  }, [selectorEntries, search]);

  const toggleEntry = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const templateAccounts = accounts.map((a) => ({ id: a.id, name: a.name }));
  const templateCards = creditCards.map((c) => ({ id: c.id, name: c.name }));

  const handleDownload = async (withProducts: boolean) => {
    try {
      await downloadImportTemplate({
        accounts: templateAccounts,
        creditCards: templateCards,
        products: withProducts
          ? selectorEntries.filter((e) => selected.has(e.key)).map((e) => e.row)
          : undefined,
      });
      setStep("upload");
    } catch {
      toast.error("No se pudo generar la plantilla");
    }
  };

  // ── Subida + dry run ──────────────────────────────────────────────────
  const postImport = async (
    selectedFile: File,
    opts: { dryRun?: boolean; offset?: number; limit?: number } = {}
  ) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");
    const formData = new FormData();
    formData.append("file", selectedFile);
    const params = new URLSearchParams();
    if (opts.dryRun) params.set("dry_run", "true");
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const res = await fetch(`/api/inventory/import${qs ? `?${qs}` : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error al procesar el archivo");
    return json;
  };

  const handleFile = async (selectedFile: File) => {
    setIsWorking(true);
    try {
      const json = await postImport(selectedFile, { dryRun: true });
      setFile(selectedFile);
      setPreviewRows(json.data.rows);
      setSummary(json.data.summary);
      setPreviewPage(1);
      setStep("preview");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsWorking(false);
    }
  };

  // Ejecuta en lotes secuenciales para que cada request al servidor se
  // mantenga muy por debajo del timeout de la función serverless — necesario
  // para archivos grandes (hasta MAX_IMPORT_ROWS filas).
  const handleImport = async () => {
    if (!file) return;
    setIsWorking(true);
    const total = previewRows.length;
    const showProgress = total > IMPORT_EXECUTE_CHUNK_SIZE;
    const toastId = showProgress ? toast.loading(`Importando 0/${total} filas...`) : undefined;
    try {
      const allResults: RowResult[] = [];
      let offset = 0;
      while (offset < total) {
        const json = await postImport(file, { offset, limit: IMPORT_EXECUTE_CHUNK_SIZE });
        allResults.push(...json.data.results);
        offset += IMPORT_EXECUTE_CHUNK_SIZE;
        if (toastId) toast.loading(`Importando ${Math.min(offset, total)}/${total} filas...`, { id: toastId });
      }
      if (toastId) toast.dismiss(toastId);
      setResults(allResults);
      setConfirmOpen(false);
      setStep("report");
      onSuccess();
    } catch (error: any) {
      if (toastId) toast.dismiss(toastId);
      toast.error(error.message);
      setConfirmOpen(false);
    } finally {
      setIsWorking(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("template");
      setShowSelector(false);
      setSearch("");
      setSelected(new Set());
      setFile(null);
      setPreviewRows([]);
      setSummary(null);
      setResults([]);
    }
    onOpenChange(nextOpen);
  };

  const actionableRows = previewRows.filter((r) => r.action !== "error" && r.action !== "omitir").length;
  const totalToDebit = summary?.financial.reduce((acc, f) => acc + f.total, 0) ?? 0;
  const failedResults = results.filter((r) => r.status === "failed");
  const pendingCreated = results.some((r) => r.purchaseId && (r.action === "crear_pendiente" || r.action === "agregar_pendiente"));

  const pagedPreview = previewRows.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE
  );

  const subtitles: Record<Step, string> = {
    template: "Paso 1 de 4 — Descargá la plantilla",
    upload: "Paso 2 de 4 — Subí tu archivo",
    preview: "Paso 3 de 4 — Revisá antes de importar",
    report: "Paso 4 de 4 — Resultado",
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={handleClose}
        title="Importar Excel"
        subtitle={subtitles[step]}
        icon={FileSpreadsheet}
        width="2xl"
        height="tall"
        footer={
          step === "preview" ? (
            <>
              <Button variant="outline" className="flex-1" disabled={isWorking} onClick={() => setStep("upload")}>
                <ArrowLeft className="size-4 mr-1.5" /> Atrás
              </Button>
              <Button
                className="flex-1"
                disabled={isWorking || actionableRows === 0}
                onClick={() => setConfirmOpen(true)}
              >
                Importar {actionableRows} fila{actionableRows !== 1 ? "s" : ""}
              </Button>
            </>
          ) : step === "report" ? (
            <Button className="flex-1" onClick={() => handleClose(false)}>Cerrar</Button>
          ) : undefined
        }
      >
        <FeatureGate feature="products.bulk_import">
          {/* ── Paso 1: plantilla ─────────────────────────────────────── */}
          {step === "template" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleDownload(false)}
                className="w-full flex items-center gap-3 rounded-xl border p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <Download className="size-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Plantilla vacía</p>
                  <p className="text-xs text-muted-foreground">
                    Para crear productos nuevos — con inventario listo, pendiente de llegar, o sin stock
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowSelector((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border p-4 text-left hover:bg-muted/50 transition-colors",
                  showSelector && "border-primary bg-primary/5"
                )}
              >
                <FileSpreadsheet className="size-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Con mis productos</p>
                  <p className="text-xs text-muted-foreground">
                    Seleccioná productos registrados para agregarles inventario (listo o pendiente)
                  </p>
                </div>
              </button>

              {showSelector && (
                <div className="space-y-2 rounded-xl border p-3">
                  <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o SKU..." />
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No hay productos con SKU que coincidan
                      </p>
                    ) : (
                      filteredEntries.map((entry) => (
                        <label
                          key={entry.key}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(entry.key)}
                            onCheckedChange={() => toggleEntry(entry.key)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{entry.row.nombre}</p>
                            <p className="text-xs text-muted-foreground font-mono">{entry.row.sku}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <Button
                    className="w-full"
                    disabled={selected.size === 0}
                    onClick={() => handleDownload(true)}
                  >
                    <Download className="size-4 mr-1.5" />
                    Descargar con {selected.size} producto{selected.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              )}

              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep("upload")}>
                Ya tengo mi archivo →
              </Button>
            </div>
          )}

          {/* ── Paso 2: subir ─────────────────────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={isWorking}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 hover:bg-muted/40 transition-colors disabled:opacity-60"
              >
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {isWorking ? "Analizando archivo..." : "Tocá para elegir tu archivo .xlsx"}
                </p>
                <p className="text-xs text-muted-foreground">Máximo {MAX_IMPORT_ROWS} filas · 5 MB</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep("template")}>
                <ArrowLeft className="size-4 mr-1.5" /> Volver a la plantilla
              </Button>
            </div>
          )}

          {/* ── Paso 3: preview ───────────────────────────────────────── */}
          {step === "preview" && summary && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {summary.newProducts > 0 && <Badge className="bg-blue-100 text-blue-700 border-blue-200">{summary.newProducts} producto{summary.newProducts !== 1 ? "s" : ""} nuevo{summary.newProducts !== 1 ? "s" : ""}</Badge>}
                {summary.readyBatches > 0 && <Badge className="bg-green-100 text-green-700 border-green-200">{summary.readyBatches} lote{summary.readyBatches !== 1 ? "s" : ""} listo{summary.readyBatches !== 1 ? "s" : ""}</Badge>}
                {summary.pendingPurchases > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-200">{summary.pendingPurchases} pendiente{summary.pendingPurchases !== 1 ? "s" : ""} de llegar</Badge>}
                {summary.errorRows > 0 && <Badge variant="destructive">{summary.errorRows} con error</Badge>}
              </div>

              {summary.financial.length > 0 && (
                <div className="rounded-xl border p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Se debitará al importar:</p>
                  {summary.financial.map((f) => (
                    <div key={`${f.kind}-${f.id}`} className="flex justify-between text-sm">
                      <span>{f.name} {f.kind === "credit_card" && <span className="text-xs text-muted-foreground">(tarjeta)</span>}</span>
                      <span className="font-medium">{format(f.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm border-t pt-1.5 font-semibold">
                    <span>Total</span><span>{format(totalToDebit)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {pagedPreview.map((row) => {
                  const badge = ACTION_BADGES[row.action] ?? ACTION_BADGES.omitir;
                  return (
                    <div
                      key={row.rowNumber}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        row.action === "error" && "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {row.productName ?? row.nombre ?? row.sku ?? `Fila ${row.rowNumber}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Fila {row.rowNumber}
                            {row.sku && <> · <span className="font-mono">{row.sku}</span></>}
                            {row.cantidad !== null && <> · {row.cantidad} uds</>}
                            {row.account && <> · {row.account.name}</>}
                          </p>
                        </div>
                        <Badge className={cn("shrink-0", badge.className)}>{badge.label}</Badge>
                      </div>
                      {row.errors.map((err, i) => (
                        <p key={i} className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                          <XCircle className="size-3.5 shrink-0 mt-px" /> {err}
                        </p>
                      ))}
                      {row.warnings.map((warn, i) => (
                        <p key={i} className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-3.5 shrink-0 mt-px" /> {warn}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>

              <PaginationControls
                page={previewPage}
                totalPages={Math.ceil(previewRows.length / PREVIEW_PAGE_SIZE)}
                total={previewRows.length}
                label="filas"
                onPageChange={setPreviewPage}
              />
            </div>
          )}

          {/* ── Paso 4: reporte ───────────────────────────────────────── */}
          {step === "report" && (
            <div className="space-y-3">
              <div className={cn(
                "flex items-center gap-3 rounded-xl border p-4",
                failedResults.length === 0
                  ? "border-green-200 bg-green-50/60 dark:bg-green-950/20 dark:border-green-900/40"
                  : "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40"
              )}>
                {failedResults.length === 0
                  ? <CheckCircle2 className="size-5 text-green-600 shrink-0" />
                  : <AlertTriangle className="size-5 text-amber-600 shrink-0" />}
                <p className="text-sm font-medium">
                  {failedResults.length === 0
                    ? "Importación completada"
                    : `Importación completada — ${failedResults.length} fila${failedResults.length !== 1 ? "s" : ""} fallida${failedResults.length !== 1 ? "s" : ""}. Corregí solo esas filas en tu archivo y volvé a subirlas.`}
                </p>
              </div>

              {pendingCreated && (
                <a
                  href="/purchases/pending"
                  className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 transition-colors"
                >
                  <span className="flex items-center gap-2"><Clock className="size-4" /> Ver compras pendientes de llegada</span>
                  <ExternalLink className="size-4 shrink-0" />
                </a>
              )}

              <div className="space-y-1.5">
                {results.map((result) => {
                  const badge = ACTION_BADGES[result.action] ?? ACTION_BADGES.omitir;
                  return (
                    <div
                      key={result.rowNumber}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                        result.status === "failed" && "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/40"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {result.status === "ok"
                          ? <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                          : <XCircle className="size-4 text-red-600 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm truncate">
                            {result.productName ?? result.sku ?? `Fila ${result.rowNumber}`}
                            <span className="text-xs text-muted-foreground"> · fila {result.rowNumber}</span>
                          </p>
                          {result.error && <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>}
                        </div>
                      </div>
                      <Badge className={cn("shrink-0", badge.className)}>{badge.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </FeatureGate>
      </ResponsiveModal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Importar ${actionableRows} fila${actionableRows !== 1 ? "s" : ""}?`}
        description={
          totalToDebit > 0
            ? `Se debitará ${format(totalToDebit)} de tus cuentas/tarjetas según el detalle del resumen. Esta acción registra compras y movimientos financieros.`
            : "Se crearán los productos y lotes del archivo. Esta acción no toca tus cuentas."
        }
        confirmLabel="Importar"
        variant={totalToDebit > 0 ? "warning" : "default"}
        isLoading={isWorking}
        onConfirm={handleImport}
      />
    </>
  );
}
