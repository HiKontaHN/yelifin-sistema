// app/api/supply-purchases/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

function toISOOrNull(value: any) {
  const s = (value ?? "").toString().trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView', 'SUPPLIES');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to   = searchParams.get("to");

    const fromISO = from ? toISOOrNull(`${from}T00:00:00`) : null;
    const toISO   = to   ? toISOOrNull(`${to}T23:59:59`)   : null;

    const purchases = await sql`
      SELECT
        sp.id,
        sp.org_id,
        sp.supplier_id,
        sp.account_id,
        a.name AS account_name,
        sp.purchased_at,
        sp.created_at,
        COALESCE(SUM(spi.line_total), 0) AS total,
        COUNT(spi.id)::int AS items_count
      FROM supply_purchases sp
      LEFT JOIN supply_purchase_items spi ON spi.supply_purchase_id = sp.id
      LEFT JOIN accounts a ON a.id = sp.account_id
      WHERE sp.org_id = ${orgId}
        AND (${fromISO}::timestamptz IS NULL OR sp.purchased_at >= ${fromISO}::timestamptz)
        AND (${toISO}::timestamptz   IS NULL OR sp.purchased_at <= ${toISO}::timestamptz)
      GROUP BY sp.id, a.name
      ORDER BY sp.purchased_at DESC
    `;

    return Response.json({ data: purchases, total: purchases.length });
  } catch (error) {
    console.error(" GET /api/supply-purchases:", error);
    return createErrorResponse("Error al obtener compras de suministros", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit', 'SUPPLIES');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const body = await request.json().catch(() => ({}));

    // Cuenta requerida
    const account_id = Number(body?.account_id);
    if (!account_id || isNaN(account_id))
      return createErrorResponse("La cuenta es requerida", 400);

    // Verificar cuenta
    const [account] = await sql`
      SELECT id, balance FROM accounts
      WHERE id = ${account_id} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!account) return createErrorResponse("Cuenta no encontrada", 404);

    const supplier_id =
      body?.supplier_id === null || body?.supplier_id === undefined
        ? null
        : Number(body.supplier_id);

    if (supplier_id !== null && Number.isNaN(supplier_id))
      return createErrorResponse("Proveedor inválido", 400);

    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return createErrorResponse("Se requiere al menos un item", 400);

    let purchased_at: string | null = null;
    const rawPurchasedAt = (body?.purchased_at ?? "").toString().trim();
    if (!rawPurchasedAt) {
      purchased_at = new Date().toISOString();
    } else {
      purchased_at =
        rawPurchasedAt.length === 10 && rawPurchasedAt.includes("-")
          ? toISOOrNull(`${rawPurchasedAt}T00:00:00`)
          : toISOOrNull(rawPurchasedAt);
      if (!purchased_at) return createErrorResponse("Fecha inválida", 400);
    }

    const normalizedItems: { supply_id: number; quantity: number; unit_cost: number; line_total: number }[] = [];
    for (const it of items) {
      const supply_id  = Number(it?.supply_id);
      const quantity   = Number(it?.quantity);
      const unit_cost  = Number(it?.unit_cost);

      if (!supply_id  || isNaN(supply_id))  return createErrorResponse("supply_id inválido", 400);
      if (isNaN(quantity)  || quantity <= 0) return createErrorResponse("Cantidad inválida", 400);
      if (isNaN(unit_cost) || unit_cost < 0) return createErrorResponse("Costo unitario inválido", 400);

      normalizedItems.push({ supply_id, quantity, unit_cost, line_total: quantity * unit_cost });
    }

    const total = normalizedItems.reduce((acc, x) => acc + x.line_total, 0);

    await sql`BEGIN`;
    try {
      // 1. Crear supply_purchase con account_id
      const [purchase] = await sql`
        INSERT INTO supply_purchases (org_id, created_by, supplier_id, account_id, purchased_at)
        VALUES (${orgId}, ${userId}, ${supplier_id}, ${account_id}, ${purchased_at}::timestamptz)
        RETURNING id
      `;
      const purchaseId = purchase.id as number;

      // 2. Items + actualizar stock
      for (const it of normalizedItems) {
        const [exists] = await sql`
          SELECT id FROM supplies WHERE id = ${it.supply_id} AND org_id = ${orgId}
        `;
        if (!exists) {
          await sql`ROLLBACK`;
          return createErrorResponse("Suministro no encontrado", 404);
        }

        await sql`
          INSERT INTO supply_purchase_items (
            org_id, created_by, supply_purchase_id, supply_id,
            quantity, unit_cost, line_total
          ) VALUES (
            ${orgId}, ${userId}, ${purchaseId}, ${it.supply_id},
            ${it.quantity}, ${it.unit_cost}, ${it.line_total}
          )
        `;

        await sql`
          UPDATE supplies
          SET stock = stock + ${it.quantity}, unit_cost = ${it.unit_cost}
          WHERE id = ${it.supply_id} AND org_id = ${orgId}
        `;
      }

      // 3. Registrar transacción de egreso
      await sql`
        INSERT INTO transactions (
          org_id, created_by, account_id, type, amount,
          description, reference_type, reference_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${account_id}, 'EXPENSE', ${total},
          ${'Compra de suministros #' + purchaseId}, 'SUPPLY_PURCHASE', ${purchaseId},
          ${purchased_at}::timestamptz
        )
      `;

      // 4. Descontar balance de la cuenta
      await sql`
        UPDATE accounts
        SET balance = balance - ${total}
        WHERE id = ${account_id} AND org_id = ${orgId}
      `;

      await sql`COMMIT`;

      return Response.json(
        { message: "Compra registrada", data: { id: purchaseId, total } },
        { status: 201 }
      );
    } catch (inner) {
      await sql`ROLLBACK`;
      throw inner;
    }
  } catch (error) {
    console.error(" POST /api/supply-purchases:", error);
    return createErrorResponse("Error al registrar compra de suministros", 500);
  }
} 