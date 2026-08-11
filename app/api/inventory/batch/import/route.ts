// app/api/inventory/batch/import/route.ts
// POST — Lee un Excel y registra entradas de inventario en lote.

import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import * as XLSX from "xlsx";
import type { BatchImportResult, BatchImportErrorDetail } from "@/types/inventory-batch";

const sql = neon(process.env.DATABASE_URL!);

// ── Helpers ────────────────────────────────────────────────────────────

function parseDate(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const num = Number(str);
  if (!isNaN(num) && num > 40000) {
    const d = XLSX.SSF.parse_date_code(num);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];

  return null;
}

function asNum(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function asStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

// ── Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { userId } = auth.data;

    // ── 1. Leer el archivo del FormData ────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return createErrorResponse("Se requiere un archivo Excel", 400);
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: "buffer" });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    if (!ws) {
      return createErrorResponse("El archivo no contiene hojas válidas", 400);
    }

    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      raw: true,
      defval: null,
    });

    if (raw.length === 0) {
      return createErrorResponse("El archivo no contiene filas de datos", 400);
    }

    // ── 2. Moneda principal + cuentas del usuario ─────────────────────
    const [profile] = await sql`
      SELECT currency FROM user_profile WHERE user_id = ${userId} LIMIT 1
    `;
    const userCurrency = (profile?.currency ?? "HNL").toUpperCase();
    const validCurrencies = new Set(
      userCurrency === "USD" ? ["USD"] : [userCurrency, "USD"]
    );

    const userAccounts = await sql`
      SELECT id, name FROM accounts
      WHERE user_id  = ${userId}
        AND is_active = TRUE
    `;
    const accountByName = new Map<string, number>(
      userAccounts.map((a: any) => [String(a.name).toLowerCase(), Number(a.id)])
    );

    // ── 3. Procesar cada fila ─────────────────────────────────────────
    const errores: BatchImportErrorDetail[] = [];
    let procesados = 0;
    let productos_creados = 0;

    for (let i = 0; i < raw.length; i++) {
      const rowNumber = i + 2; // +2: header row + 1-based
      const row = raw[i];

      // Extraer campos
      const sku             = asStr(row["sku"]);
      const nombre_producto = asStr(row["nombre_producto"]);
      const variante_id_str = asStr(row["variante_id"]);
      const cantidad        = asNum(row["cantidad"]);
      const precio_unitario = asNum(row["precio_unitario"]);
      const moneda          = asStr(row["moneda"]).toUpperCase();
      const cuenta_nombre   = asStr(row["cuenta"]);
      const tipo_cambio_raw = asNum(row["tipo_cambio"]);
      const fecha_str       = parseDate(row["fecha"]);
      const notas           = asStr(row["notas"]) || null;

      // ── Validaciones ──────────────────────────────────────────────
      if (!variante_id_str && !nombre_producto && !sku) {
        errores.push({ fila: rowNumber, error: "Se requiere SKU, nombre de producto o variante_id" });
        continue;
      }

      if (cantidad === null || cantidad < 1 || !Number.isInteger(cantidad)) {
        errores.push({ fila: rowNumber, error: "La cantidad debe ser un entero mayor a 0" });
        continue;
      }

      if (precio_unitario === null || precio_unitario < 0) {
        errores.push({ fila: rowNumber, error: "El precio unitario debe ser >= 0" });
        continue;
      }

      if (!validCurrencies.has(moneda)) {
        errores.push({ fila: rowNumber, error: `Moneda inválida: '${moneda}'. Use: ${[...validCurrencies].join(", ")}` });
        continue;
      }

      const tipo_cambio = tipo_cambio_raw ?? 1;
      if (tipo_cambio <= 0) {
        errores.push({ fila: rowNumber, error: "El tipo de cambio debe ser mayor a 0" });
        continue;
      }

      if (!fecha_str) {
        errores.push({ fila: rowNumber, error: "Fecha inválida. Use formato YYYY-MM-DD" });
        continue;
      }

      // Resolver cuenta por nombre (opcional)
      let cuenta_id: number | null = null;
      if (cuenta_nombre) {
        const resolvedId = accountByName.get(cuenta_nombre.toLowerCase());
        if (!resolvedId) {
          errores.push({ fila: rowNumber, error: `Cuenta "${cuenta_nombre}" no encontrada o inactiva` });
          continue;
        }
        cuenta_id = resolvedId;
      }

      const unit_cost =
        moneda !== userCurrency ? precio_unitario * tipo_cambio : precio_unitario;

      // ── Buscar producto + variante ─────────────────────────────────
      // IMPORTANTE: Las filas de variante llevan el SKU de la variante (no del producto
      // base) en la columna 'sku'. Por eso, cuando variante_id está presente debemos
      // buscar directamente en product_variants para obtener el product_id correcto, en
      // lugar de buscar en products por SKU (lo que causaría la creación de productos
      // duplicados con el SKU de la variante).
      let product_id: number;
      let variant_id: number | null = null;

      if (variante_id_str) {
        // Fila de variante: product_id viene de la variante misma
        const variante_id_num = Number(variante_id_str);
        if (isNaN(variante_id_num)) {
          errores.push({ fila: rowNumber, error: `variante_id inválido: '${variante_id_str}'` });
          continue;
        }

        const [existingVariant] = await sql`
          SELECT id, product_id FROM product_variants
          WHERE id        = ${variante_id_num}
            AND user_id   = ${userId}
            AND is_active = TRUE
          LIMIT 1
        `;

        if (!existingVariant) {
          errores.push({ fila: rowNumber, error: `La variante ${variante_id_num} no existe o no pertenece a tu cuenta` });
          continue;
        }

        variant_id = variante_id_num;
        product_id = existingVariant.product_id;

      } else {
        // Fila base: buscar producto por SKU o por nombre
        if (sku) {
          const [existingProduct] = await sql`
            SELECT id FROM products
            WHERE user_id   = ${userId}
              AND sku       = ${sku}
              AND is_active = TRUE
            LIMIT 1
          `;

          if (existingProduct) {
            product_id = existingProduct.id;
          } else {
            if (!nombre_producto) {
              errores.push({ fila: rowNumber, error: `No se encontró producto con SKU '${sku}' y no hay nombre para crearlo` });
              continue;
            }
            const [newProduct] = await sql`
              INSERT INTO products (user_id, name, sku, price, is_active, is_service)
              VALUES (${userId}, ${nombre_producto}, ${sku}, 0, TRUE, FALSE)
              RETURNING id
            `;
            product_id = newProduct.id;
            productos_creados++;
          }
        } else {
          // Sin SKU: buscar por nombre exacto
          const [existingProduct] = await sql`
            SELECT id FROM products
            WHERE user_id   = ${userId}
              AND name      = ${nombre_producto}
              AND is_active = TRUE
            LIMIT 1
          `;

          if (existingProduct) {
            product_id = existingProduct.id;
          } else {
            const [newProduct] = await sql`
              INSERT INTO products (user_id, name, price, is_active, is_service)
              VALUES (${userId}, ${nombre_producto}, 0, TRUE, FALSE)
              RETURNING id
            `;
            product_id = newProduct.id;
            productos_creados++;
          }
        }
      }

      // ── Registrar inventario (atómico por fila) ───────────────────
      const receivedAt = new Date(`${fecha_str}T00:00:00-06:00`).toISOString();
      const totalCost  = unit_cost * cantidad;

      await sql`BEGIN`;
      try {
        const [newBatch] = await sql`
          INSERT INTO inventory_batches (
            user_id, product_id, variant_id,
            qty_in, qty_available, unit_cost, received_at
          )
          VALUES (
            ${userId}, ${product_id}, ${variant_id ?? null},
            ${cantidad}, ${cantidad}, ${unit_cost}, ${receivedAt}
          )
          RETURNING id
        `;

        await sql`
          INSERT INTO inventory_movements (
            user_id, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, notes
          )
          VALUES (
            ${userId}, 'IN', ${product_id}, ${variant_id ?? null},
            ${cantidad}, 'PURCHASE', ${newBatch.id}, ${notas ?? null}
          )
        `;

        // Registrar gasto financiero y actualizar saldo de cuenta
        if (cuenta_id !== null) {
          await sql`
            INSERT INTO transactions (
              user_id, account_id, type, amount,
              description, reference_type, reference_id, occurred_at
            )
            VALUES (
              ${userId}, ${cuenta_id}, 'EXPENSE', ${totalCost},
              ${"Compra de inventario (lote)"}, 'PURCHASE', ${newBatch.id}, ${receivedAt}
            )
          `;
          await sql`
            UPDATE accounts
            SET balance = balance - ${totalCost}
            WHERE id = ${cuenta_id} AND user_id = ${userId}
          `;
        }

        await sql`COMMIT`;
        procesados++;
      } catch (rowError) {
        await sql`ROLLBACK`;
        console.error(`Batch import row ${rowNumber} failed:`, rowError);
        errores.push({ fila: rowNumber, error: "Error al registrar el inventario en la base de datos" });
      }
    }

    const result: BatchImportResult = {
      procesados,
      productos_creados,
      errores,
    };

    return Response.json({ data: result });
  } catch (error) {
    console.error("POST /api/inventory/batch/import:", error);
    return createErrorResponse("Error al procesar el archivo", 500);
  }
}
