// lib/warehouses.ts
//
// Resolución de bodega para operaciones de stock. Ver
// database/migrations/v4.20-warehouses.sql para el modelo de datos.

export type Warehouse = {
  id: number;
  name: string;
  is_active: boolean;
  is_default: boolean;
};

export async function getOrgWarehouses(sql: any, orgId: number): Promise<Warehouse[]> {
  return await sql`
    SELECT id, name, is_active, is_default
    FROM warehouses
    WHERE org_id = ${orgId} AND is_active = TRUE
    ORDER BY is_default DESC, name ASC
  `;
}

// Bodega de la que debe descontar/recibir stock una acción de este
// usuario: la que tenga asignada en organization_members.default_
// warehouse_id, o si no tiene ninguna asignada (el dueño, o una org de
// una sola bodega), la bodega marcada is_default de la org. Usado por
// ventas — nunca pide selector, siempre resuelve en silencio.
export async function getDefaultWarehouseForUser(
  sql: any, orgId: number, userId: number
): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(om.default_warehouse_id, w.id) AS warehouse_id
    FROM organization_members om
    LEFT JOIN warehouses w ON w.org_id = om.org_id AND w.is_default = TRUE
    WHERE om.org_id = ${orgId} AND om.user_id = ${userId}
  `;
  if (row?.warehouse_id) return Number(row.warehouse_id);

  // Red de seguridad — no debería pasar tras la migración v4.20 (toda org
  // tiene al menos su bodega "Local Principal"), pero por si acaso.
  const [fallback] = await sql`
    SELECT id FROM warehouses
    WHERE org_id = ${orgId} AND is_active = TRUE
    ORDER BY is_default DESC, id ASC
    LIMIT 1
  `;
  if (!fallback) throw new Error(`La organización ${orgId} no tiene ninguna bodega activa`);
  return Number(fallback.id);
}

// Resuelve la bodega para una acción con selector explícito (compras,
// ajuste manual, import por Excel): si el body trae warehouse_id, lo
// valida contra la org; si no trae nada (org de una sola bodega, sin
// selector visible), usa la bodega is_default.
export async function resolveWarehouseId(
  sql: any, orgId: number, requestedWarehouseId?: number | string | null
): Promise<{ warehouseId: number; error: null } | { warehouseId: null; error: string }> {
  if (requestedWarehouseId) {
    const [w] = await sql`
      SELECT id FROM warehouses
      WHERE id = ${Number(requestedWarehouseId)} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!w) return { warehouseId: null, error: "Bodega no encontrada o inactiva" };
    return { warehouseId: Number(w.id), error: null };
  }

  const [def] = await sql`SELECT id FROM warehouses WHERE org_id = ${orgId} AND is_default = TRUE`;
  if (!def) return { warehouseId: null, error: "La organización no tiene una bodega por defecto configurada" };
  return { warehouseId: Number(def.id), error: null };
}
