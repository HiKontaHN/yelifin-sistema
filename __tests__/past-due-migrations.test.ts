import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "database", "migrations", "fix-subscriptions");
const freePlanSql = readFileSync(join(migrationsDir, "01-create-free-plan.sql"), "utf8");
const graceSql = readFileSync(join(migrationsDir, "02-add-past-due-grace.sql"), "utf8");

describe("migraciones de gracia PAST_DUE", () => {
  it("define los límites centrales del plan Gratis", () => {
    expect(freePlanSql).toContain("'free'");
    expect(freePlanSql).toMatch(/0\.00,[\s\S]*'MONTHLY',[\s\S]*30,[\s\S]*100,[\s\S]*NULL,[\s\S]*2,[\s\S]*0,[\s\S]*NULL,[\s\S]*1,[\s\S]*1/);
    expect(freePlanSql).toContain("'reports.sales'");
    expect(freePlanSql).not.toContain("'customers.manage',");
  });

  it("centraliza el fallback y limita la degradación a Básico y Pro", () => {
    expect(graceSql).toContain("ARRAY['basico', 'pro']::TEXT[]");
    expect(graceSql).toContain("WHERE slug = 'free'");
    expect(graceSql).toContain("COALESCE(fallback_plan_id, contracted_plan_id)");
  });

  it("termina la gracia en la medianoche local seis fechas después", () => {
    expect(graceSql).toContain("COALESCE(NULLIF(o.timezone, ''), 'America/Tegucigalpa')");
    expect(graceSql).toMatch(/past_due_since AT TIME ZONE[\s\S]+::date \+ 6/);
    expect(graceSql).toContain("NOW() < grace_ends_at");
  });

  it("impide una gracia infinita y preserva el reloj mientras continúa PAST_DUE", () => {
    expect(graceSql).toContain("COALESCE(OLD.past_due_since, NEW.past_due_since, NOW())");
    expect(graceSql).toContain("CHECK (status <> 'PAST_DUE' OR past_due_since IS NOT NULL)");
    expect(graceSql).toContain("past_due_since IS NULL OR NOW() >= grace_ends_at");
  });

  it("aborta sin free, usa transacción y calcula el TRIAL vencido", () => {
    expect(graceSql).toMatch(/^--[\s\S]*BEGIN;/);
    expect(graceSql).toContain("RAISE EXCEPTION");
    expect(graceSql).toContain("os.status = 'TRIAL'");
    expect(graceSql).toContain("AT TIME ZONE 'UTC'");
    expect(graceSql).toContain("AS is_trial_expired");
    expect(graceSql.trimEnd()).toMatch(/COMMIT;$/);
  });
});
