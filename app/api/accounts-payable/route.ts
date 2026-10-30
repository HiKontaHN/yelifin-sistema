import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

const FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "ONCE"] as const;
const TERM_UNITS = ["DAYS", "WEEKS", "MONTHS"] as const;
const INTEREST_PERIODS = ["NONE", "ANNUAL", "MONTHLY", "WEEKLY"] as const;
const ACCOUNT_TYPES = ["SUPPLIER_CREDIT", "BANK_LOAN", "CREDIT_CARD", "PERSONAL_LOAN", "OTHER"] as const;

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function calculatePlan(amount: number, frequency: string, termUnit: string, termCount: number, rate: number, interestPeriod: string) {
  const durationDays = termUnit === "DAYS" ? termCount : termUnit === "WEEKS" ? termCount * 7 : termCount * 30;
  const durationMonths = durationDays / 30;
  const durationWeeks = durationDays / 7;
  const periods = frequency === "WEEKLY" ? Math.max(1, Math.ceil(durationWeeks)) : frequency === "BIWEEKLY" ? Math.max(1, Math.ceil(durationWeeks / 2)) : frequency === "MONTHLY" ? Math.max(1, Math.ceil(durationMonths)) : 1;
  const interestBase = interestPeriod === "ANNUAL" ? durationMonths / 12 : interestPeriod === "MONTHLY" ? durationMonths : interestPeriod === "WEEKLY" ? durationWeeks : 0;
  const totalInterest = Math.round(amount * (rate / 100) * interestBase * 100) / 100;
  const totalPayable = Math.round((amount + totalInterest) * 100) / 100;
  return { durationDays, periods, totalInterest, totalPayable, installmentAmount: Math.round((totalPayable / periods) * 100) / 100 };
}

async function authFor(request: NextRequest, permission: "canView" | "canEdit") {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return { response: createErrorResponse(auth.error, auth.status) } as const;
  const deny = await requireModule(auth.data, "FINANCES", permission, "ACCOUNTS");
  if (deny) return { response: deny } as const;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return { response: feature } as const;
  return { auth } as const;
}

export async function GET(request: NextRequest) {
  const checked = await authFor(request, "canView");
  if ("response" in checked) return checked.response;
  const search = request.nextUrl.searchParams.get("search")?.trim() || null;
  try {
    const data = await sql`
      SELECT ap.*, e.name AS entity_name, e.entity_type,
        COALESCE(SUM(app.amount), 0) AS paid_amount
      FROM accounts_payable ap
      JOIN financial_entities e ON e.id = ap.entity_id
      LEFT JOIN accounts_payable_payments app ON app.payable_id = ap.id
      WHERE ap.org_id = ${checked.auth.data.orgId}
        AND (${search}::text IS NULL OR e.name ILIKE ${"%" + (search ?? "") + "%"} OR ap.description ILIKE ${"%" + (search ?? "") + "%"})
      GROUP BY ap.id, e.name, e.entity_type
      ORDER BY ap.status = 'PAID', ap.due_date NULLS LAST, ap.created_at DESC
    `;
    return Response.json({ data });
  } catch (error) {
    console.error("GET /api/accounts-payable:", error);
    return createErrorResponse("Error al obtener cuentas por pagar", 500);
  }
}

export async function POST(request: NextRequest) {
  const checked = await authFor(request, "canEdit");
  if ("response" in checked) return checked.response;
  try {
    const body = await request.json();
    const entityId = Number(body.entity_id);
    const amount = Number(body.original_amount);
    const frequency = String(body.payment_frequency ?? "MONTHLY");
    const termUnit = String(body.term_unit ?? "MONTHS");
    const termCount = Number(body.term_count ?? 1);
    const interestPeriod = String(body.interest_period ?? "NONE");
    const interestRate = Number(body.interest_rate ?? 0);
    const accountType = String(body.account_type ?? "OTHER");
    const description = String(body.description ?? "Cuenta por pagar").trim();
    if (!Number.isSafeInteger(entityId) || entityId <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return createErrorResponse("Entidad y monto son requeridos", 400);
    }
    if (!ACCOUNT_TYPES.includes(accountType as any) || !description || !FREQUENCIES.includes(frequency as any) || !TERM_UNITS.includes(termUnit as any) || !INTEREST_PERIODS.includes(interestPeriod as any) || !Number.isInteger(termCount) || termCount <= 0 || !Number.isFinite(interestRate) || interestRate < 0) {
      return createErrorResponse("Configuración de financiamiento inválida", 400);
    }
    const [entity] = await sql`SELECT id FROM financial_entities WHERE id = ${entityId} AND org_id = ${checked.auth.data.orgId} AND is_active = TRUE`;
    if (!entity) return createErrorResponse("Entidad no encontrada", 404);
    const startDate = String(body.start_date ?? new Date().toISOString().slice(0, 10));
    const plan = calculatePlan(amount, frequency, termUnit, termCount, interestRate, interestPeriod);
    const dueDate = body.due_date ?? addDays(new Date(`${startDate}T12:00:00`), plan.durationDays);
    const row = await withTransaction(async (tx) => {
      const [payable] = await tx`
        INSERT INTO accounts_payable (
          org_id, entity_id, account_type, description, original_amount, outstanding_amount,
          currency, interest_rate, start_date, due_date, notes, created_by,
          payment_frequency, term_unit, term_count, interest_period, total_interest,
          total_payable, installment_count, installment_amount
        ) VALUES (
          ${checked.auth.data.orgId}, ${entityId}, ${accountType},
          ${description}, ${amount}, ${plan.totalPayable},
          ${body.currency ?? "HNL"}, ${interestRate || null}, ${startDate}, ${dueDate}, ${body.notes ?? null}, ${checked.auth.data.userId},
          ${frequency}, ${termUnit}, ${termCount}, ${interestPeriod}, ${plan.totalInterest},
          ${plan.totalPayable}, ${plan.periods}, ${plan.installmentAmount}
        ) RETURNING *
      `;
      for (let index = 1; index <= plan.periods; index += 1) {
        const stepDays = frequency === "WEEKLY" ? index * 7 : frequency === "BIWEEKLY" ? index * 14 : frequency === "MONTHLY" ? index * 30 : plan.durationDays;
        const installmentAmount = index === plan.periods ? plan.totalPayable - plan.installmentAmount * (plan.periods - 1) : plan.installmentAmount;
        await tx`
          INSERT INTO accounts_payable_installments (payable_id, installment_number, due_date, amount)
          VALUES (${payable.id}, ${index}, ${addDays(new Date(`${startDate}T12:00:00`), Math.min(stepDays, plan.durationDays))}, ${Math.round(installmentAmount * 100) / 100})
        `;
      }
      return payable;
    });
    return Response.json({ data: row }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts-payable:", error);
    return createErrorResponse("Error al crear cuenta por pagar", 500);
  }
}
