// app/api/inventory/batch/export/route.ts
// POST — Genera un Excel de plantilla para registro de inventario por lotes.

import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import * as XLSX from "xlsx";

const sql = neon(process.env.DATABASE_URL!);

const CURRENCY_NAMES: Record<string, string> = {
  HNL: "Lempira hondureño",
  USD: "Dólar estadounidense",
  MXN: "Peso mexicano",
  GTQ: "Quetzal guatemalteco",
  CRC: "Colón costarricense",
  EUR: "Euro",
};

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { userId } = auth.data;
    const body = await request.json();
    const { productIds } = body as { productIds: number[] };

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return createErrorResponse("Se requiere al menos un producto", 400);
    }

    // ── 0. Moneda principal del usuario ────────────────────────────────
    const [profile] = await sql`
      SELECT currency FROM user_profile WHERE user_id = ${userId} LIMIT 1
    `;
    const userCurrency = (profile?.currency ?? "HNL").toUpperCase();
    // Siempre incluir USD; deduplicar si el usuario ya usa USD
    const availableCurrencies = userCurrency === "USD"
      ? ["USD"]
      : [userCurrency, "USD"];

    // ── 1. Consultar productos + variantes del usuario ─────────────────
    const products = await sql`
      SELECT
        p.id          AS product_id,
        p.name        AS product_name,
        p.sku         AS product_sku,
        p.is_service
      FROM products p
      WHERE p.user_id  = ${userId}
        AND p.is_active = TRUE
        AND p.id = ANY(${productIds}::bigint[])
      ORDER BY p.name ASC
    `;

    if (products.length === 0) {
      return createErrorResponse("No se encontraron productos válidos", 404);
    }

    const variants = await sql`
      SELECT
        pv.id          AS variant_id,
        pv.product_id,
        pv.variant_name,
        pv.sku         AS variant_sku,
        pv.is_active
      FROM product_variants pv
      WHERE pv.user_id    = ${userId}
        AND pv.is_active  = TRUE
        AND pv.product_id = ANY(${productIds}::bigint[])
      ORDER BY pv.product_id ASC, pv.id ASC
    `;

    // ── 2. Consultar cuentas del usuario ───────────────────────────────
    const accounts = await sql`
      SELECT id, name, type
      FROM accounts
      WHERE user_id  = ${userId}
        AND is_active = TRUE
      ORDER BY name ASC
    `;

    // ── 3. Construir filas de la plantilla ─────────────────────────────
    // Columnas: sku | nombre_producto | variante_id | nombre_variante |
    //           cantidad | precio_unitario | moneda(G) | cuenta(H) | tipo_cambio | fecha | notas
    type TemplateRow = [string, string, string, string, string, string, string, string, string, string, string];

    const templateRows: TemplateRow[] = [];
    const today = new Date().toISOString().split("T")[0];
    const defaultAccount = accounts.length > 0 ? String(accounts[0].name) : "";

    for (const p of products) {
      if (p.is_service) continue;

      const productVariants = variants.filter((v: any) => v.product_id === p.product_id);

      // Siempre incluir fila del producto base
      templateRows.push([
        p.product_sku ?? "",
        p.product_name,
        "",   // variante_id vacío = producto base
        "",   // nombre_variante vacío
        "1",
        "0.00",
        userCurrency,
        defaultAccount,
        "1.00",
        today,
        "",
      ]);

      // Añadir una fila por cada variante
      for (const v of productVariants) {
        templateRows.push([
          v.variant_sku ?? p.product_sku ?? "",
          p.product_name,
          String(v.variant_id),
          v.variant_name ?? "",
          "1",
          "0.00",
          userCurrency,
          defaultAccount,
          "1.00",
          today,
          "",
        ]);
      }
    }

    if (templateRows.length === 0) {
      return createErrorResponse(
        "Los productos seleccionados son servicios y no requieren inventario físico",
        400
      );
    }

    // ── 4. Construir workbook Excel ────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Hoja principal: Inventario
    // Columna G = moneda (dropdown), Columna H = cuenta (dropdown)
    const headers = [
      "sku",           // A
      "nombre_producto", // B
      "variante_id",   // C
      "nombre_variante", // D
      "cantidad",      // E
      "precio_unitario", // F
      "moneda",        // G ← dropdown
      "cuenta",        // H ← dropdown (nombre de cuenta)
      "tipo_cambio",   // I
      "fecha",         // J
      "notas",         // K
    ];

    const wsData = [headers, ...templateRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws["!cols"] = [
      { wch: 18 }, // A sku
      { wch: 30 }, // B nombre_producto
      { wch: 12 }, // C variante_id
      { wch: 25 }, // D nombre_variante
      { wch: 10 }, // E cantidad
      { wch: 16 }, // F precio_unitario
      { wch: 10 }, // G moneda
      { wch: 30 }, // H cuenta
      { wch: 12 }, // I tipo_cambio
      { wch: 14 }, // J fecha
      { wch: 30 }, // K notas
    ];

    // ── Hojas de referencia (deben añadirse ANTES de agregar validaciones) ──

    // Hoja Cuentas: col A = id (oculto), col B = nombre
    const wsAccounts = XLSX.utils.aoa_to_sheet([
      ["id", "nombre", "tipo"],
      ...accounts.map((a: any) => [a.id, a.name, a.type]),
    ]);
    wsAccounts["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 14 }];

    // Hoja Monedas: col A = codigo
    const wsCurrencies = XLSX.utils.aoa_to_sheet([
      ["codigo", "nombre"],
      ...availableCurrencies.map((code) => [code, CURRENCY_NAMES[code] ?? code]),
    ]);
    wsCurrencies["!cols"] = [{ wch: 10 }, { wch: 30 }];

    // Hoja Instrucciones
    const wsInstructions = XLSX.utils.aoa_to_sheet([
      ["INSTRUCCIONES DE USO"],
      [""],
      ["ESTRUCTURA DE FILAS:"],
      ["· Si un producto NO tiene variantes → aparece una sola fila (variante_id vacío)."],
      ["· Si un producto SÍ tiene variantes → aparece una fila por la BASE + una fila por cada variante."],
      ["· Para registrar stock en la BASE deja variante_id vacío."],
      ["· Para registrar stock en una VARIANTE usa la fila con el variante_id correspondiente."],
      [""],
      ["COLUMNAS EDITABLES:"],
      ["3. 'cantidad': entero mayor a 0."],
      ["4. 'precio_unitario': costo de adquisición por unidad (en la moneda seleccionada)."],
      [`5. 'moneda': usa el desplegable → opciones: ${availableCurrencies.join(", ")}.`],
      ["6. 'cuenta': usa el desplegable con los nombres de la hoja 'Cuentas' (columna 'nombre')."],
      ["   Si el desplegable no funciona, escribe el nombre exacto de la cuenta o déjalo vacío."],
      ["7. 'tipo_cambio': tasa de cambio (ej. 24.89 si compraste en USD y tu moneda es HNL)."],
      ["   Si la moneda de compra es igual a tu moneda principal, deja 1.00."],
      ["8. 'fecha': formato YYYY-MM-DD (ej. 2026-05-07)."],
      ["9. 'notas': opcional."],
      [""],
      ["NO MODIFIQUES: sku, nombre_producto, variante_id, nombre_variante."],
      ["Filas con datos inválidos serán reportadas como error al importar."],
    ]);
    wsInstructions["!cols"] = [{ wch: 65 }];

    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.utils.book_append_sheet(wb, wsAccounts, "Cuentas");
    XLSX.utils.book_append_sheet(wb, wsCurrencies, "Monedas");
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instrucciones");

    // ── Data validation (dropdowns) en la hoja Inventario ─────────────
    // SheetJS formula1 para inline list: el string debe INCLUIR las comillas
    //   → '"HNL,USD"'  (el valor JS contiene los caracteres comilla doble)
    // Para range cross-sheet: referencia directa sin comillas extra
    //   → 'Cuentas!$B$2:$B$N'
    const lastDataRow = templateRows.length + 1; // +1 por el header
    if (!ws["!dataValidations"]) ws["!dataValidations"] = [];

    // Columna G (moneda) — inline list (confiable en SheetJS)
    (ws["!dataValidations"] as any[]).push({
      sqref: `G2:G${lastDataRow}`,
      type: "list",
      formula1: `"${availableCurrencies.join(",")}"`,
      showDropDown: false,
      showErrorMessage: true,
      errorStyle: "stop",
      error: `Opciones válidas: ${availableCurrencies.join(", ")}`,
      errorTitle: "Moneda inválida",
    });

    // Columna H (cuenta) — cross-sheet range: Cuentas columna B (nombre)
    if (accounts.length > 0) {
      (ws["!dataValidations"] as any[]).push({
        sqref: `H2:H${lastDataRow}`,
        type: "list",
        formula1: `Cuentas!$B$2:$B$${accounts.length + 1}`,
        showDropDown: false,
        showErrorMessage: true,
        errorStyle: "information",
        error: "Selecciona una cuenta de la lista o déjalo vacío",
        errorTitle: "Cuenta",
      });
    }

    // ── 5. Generar buffer y devolver ───────────────────────────────────
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `plantilla-inventario-${today}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("POST /api/inventory/batch/export:", error);
    return createErrorResponse("Error al generar la plantilla", 500);
  }
}
