"use client";

import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Loader2, FileSpreadsheet, CheckCircle2,
  AlertCircle, X, FileUp, PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { BatchPreviewRow, BatchImportResult } from "@/types/inventory-batch";

type ImportStep = "upload" | "preview" | "result";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

async function parseExcelPreview(file: File): Promise<BatchPreviewRow[]> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    raw: true,
    defval: null,
  });

  return raw.map((row, i): BatchPreviewRow => {
    const sku = String(row["sku"] ?? "").trim();
    const nombre_producto = String(row["nombre_producto"] ?? "").trim();
    const variante_id = row["variante_id"] ? String(row["variante_id"]).trim() : null;
    const nombre_variante = row["nombre_variante"] ? String(row["nombre_variante"]).trim() : null;
    const cantidad = row["cantidad"];
    const precio_unitario = row["precio_unitario"];
    const moneda = String(row["moneda"] ?? "").trim().toUpperCase();
    const cuenta = row["cuenta"] ? String(row["cuenta"]).trim() : null;
    const tipo_cambio = row["tipo_cambio"];
    const fecha = String(row["fecha"] ?? "").trim();
    const notas = row["notas"] ? String(row["notas"]).trim() : null;

    let valido = true;
    let error_local: string | undefined;

    if (!nombre_producto && !sku) {
      valido = false; error_local = "Falta SKU o nombre";
    } else if (!cantidad || Number(cantidad) < 1) {
      valido = false; error_local = "Cantidad inválida";
    } else if (precio_unitario === null || Number(precio_unitario) < 0) {
      valido = false; error_local = "Precio inválido";
    } else if (!moneda) {
      valido = false; error_local = "Moneda requerida";
    } else if (!fecha) {
      valido = false; error_local = "Fecha requerida";
    }

    return {
      fila: i + 2,
      sku,
      nombre_producto,
      variante_id,
      nombre_variante,
      cantidad,
      precio_unitario,
      moneda,
      cuenta,
      tipo_cambio,
      fecha,
      notas,
      valido,
      error_local,
    };
  });
}

export function BatchImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const { firebaseUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BatchPreviewRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview([]);
    setResult(null);
    setIsParsing(false);
    setIsProcessing(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = () => {
    if (isProcessing) return;
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const handleFile = async (selected: File) => {
    if (
      !selected.name.endsWith(".xlsx") &&
      !selected.name.endsWith(".xls") &&
      !selected.name.endsWith(".csv")
    ) {
      toast.error("Solo se aceptan archivos Excel (.xlsx, .xls) o CSV");
      return;
    }

    setFile(selected);
    setIsParsing(true);
    try {
      const rows = await parseExcelPreview(selected);
      if (rows.length === 0) {
        toast.error("El archivo no contiene filas de datos");
        return;
      }
      setPreview(rows);
      setStep("preview");
    } catch {
      toast.error("No se pudo leer el archivo. Verifica que sea un Excel válido.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleProcess = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("No autenticado");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/inventory/batch/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Error al procesar el archivo");
      }

      const importResult: BatchImportResult = json.data;
      setResult(importResult);
      setStep("result");

      if (importResult.procesados > 0) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || "Error al importar el lote");
    } finally {
      setIsProcessing(false);
    }
  };

  const validCount = preview.filter((r) => r.valido).length;
  const invalidCount = preview.filter((r) => !r.valido).length;
  const PREVIEW_MAX = 50;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className={cn(
          "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0",
          "w-full max-w-full rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0",
          "p-0",
          "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-full sm:max-w-md lg:max-w-xl xl:max-w-xl",
          "sm:rounded-2xl sm:border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-[48%]",
          "data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-[48%]",
          "duration-300",
        )}
        onInteractOutside={(e) => { if (isProcessing) e.preventDefault(); }}
      >
        {/* Wrapper interno: maneja el layout flex y la altura máxima para scroll correcto */}
        <div className="flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden">

          {/* Handle móvil */}
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <DialogHeader className="shrink-0 px-5 pt-2 pb-3 sm:pt-5 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Upload className="h-5 w-5 text-primary" />
              Cargar inventario por lotes
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Sube el Excel con la plantilla llena para registrar múltiples entradas de inventario.
            </p>
          </DialogHeader>

          {/* ── PASO 1: Subir archivo ───────────────────────────────── */}
          {step === "upload" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 px-5 py-6 flex flex-col items-center justify-center">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleInputChange}
                  disabled={isParsing}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => !isParsing && inputRef.current?.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !isParsing && inputRef.current?.click()}
                  className={cn(
                    "w-full max-w-sm rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-4",
                    "cursor-pointer transition-colors",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/40",
                    isParsing && "pointer-events-none opacity-60"
                  )}
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Leyendo archivo...</p>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-12 w-12 text-muted-foreground/60" />
                      <div className="text-center">
                        <p className="text-sm font-medium">
                          Arrastra el archivo aquí o haz clic para seleccionar
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          .xlsx, .xls — Usa la plantilla descargada con "Exportar plantilla"
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-2">
                        <FileUp className="h-4 w-4" />
                        Seleccionar archivo
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="shrink-0 px-5 py-4 border-t bg-background">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="w-full h-11"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* ── PASO 2: Preview ─────────────────────────────────────── */}
          {step === "preview" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="shrink-0 px-5 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium truncate max-w-45">{file?.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {validCount} válida{validCount !== 1 ? "s" : ""}
                  </Badge>
                  {invalidCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {invalidCount} con error
                    </Badge>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="px-2 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">#</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Producto / Variante</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead>Moneda</TableHead>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="w-28">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.slice(0, PREVIEW_MAX).map((row) => (
                        <TableRow
                          key={row.fila}
                          className={cn(!row.valido && "bg-destructive/5")}
                        >
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {row.fila}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.sku || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <p className="font-medium truncate max-w-30">
                              {row.nombre_producto || "—"}
                            </p>
                            {row.nombre_variante && (
                              <p className="text-xs text-muted-foreground">{row.nombre_variante}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.cantidad != null ? String(row.cantidad) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {row.precio_unitario != null ? String(row.precio_unitario) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{row.moneda || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-25">
                            {row.cuenta || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.fecha || "—"}
                          </TableCell>
                          <TableCell>
                            {row.valido ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="destructive"
                                className="text-xs max-w-24 truncate"
                                title={row.error_local}
                              >
                                {row.error_local}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview.length > PREVIEW_MAX && (
                    <p className="text-xs text-center text-muted-foreground py-2">
                      Mostrando {PREVIEW_MAX} de {preview.length} filas. Todas serán procesadas.
                    </p>
                  )}
                </div>
              </ScrollArea>

              <div className="shrink-0 px-5 py-4 border-t bg-background flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  disabled={isProcessing}
                  className="flex-1 h-11 gap-2"
                >
                  <X className="h-4 w-4" />
                  Cambiar archivo
                </Button>
                <Button
                  type="button"
                  onClick={handleProcess}
                  disabled={isProcessing || validCount === 0}
                  className="flex-1 h-11 gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <PackagePlus className="h-4 w-4" />
                      Procesar lote
                      {validCount > 0 && (
                        <Badge className="ml-1 h-5 px-1.5 bg-primary-foreground text-primary text-xs">
                          {validCount}
                        </Badge>
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── PASO 3: Resultado ───────────────────────────────────── */}
          {step === "result" && result && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 px-5 py-6 overflow-y-auto space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-green-50 dark:bg-green-950/20 p-4 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {result.procesados}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Procesados</p>
                  </div>
                  <div className="rounded-xl border p-4 text-center">
                    <p className="text-2xl font-bold text-primary">
                      {result.productos_creados}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Productos creados</p>
                  </div>
                  <div className={cn(
                    "rounded-xl border p-4 text-center",
                    result.errores.length > 0 ? "bg-destructive/5" : "bg-muted/30"
                  )}>
                    <p className={cn(
                      "text-2xl font-bold",
                      result.errores.length > 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {result.errores.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Errores</p>
                  </div>
                </div>

                {result.procesados > 0 && (
                  <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        {result.procesados} entrada{result.procesados !== 1 ? "s" : ""} de inventario registrada{result.procesados !== 1 ? "s" : ""} correctamente
                      </p>
                      {result.productos_creados > 0 && (
                        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                          Se crearon {result.productos_creados} producto{result.productos_creados !== 1 ? "s" : ""} nuevo{result.productos_creados !== 1 ? "s" : ""}.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {result.errores.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      Filas con error ({result.errores.length})
                    </p>
                    <ScrollArea className="max-h-48 rounded-lg border">
                      <div className="divide-y">
                        {result.errores.map((e) => (
                          <div key={e.fila} className="flex items-start gap-3 px-3 py-2.5 bg-destructive/5">
                            <Badge variant="outline" className="shrink-0 text-xs mt-0.5">
                              Fila {e.fila}
                            </Badge>
                            <p className="text-xs text-destructive">{e.error}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
              <div className="shrink-0 px-5 py-4 border-t bg-background flex gap-3">
                {result.errores.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reset}
                    className="flex-1 h-11 gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Subir otro archivo
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 h-11"
                >
                  {result.errores.length > 0 ? "Cerrar" : "Finalizar"}
                </Button>
              </div>

            </div>
          )}


        </div>
      </DialogContent>
    </Dialog>
  );
}
