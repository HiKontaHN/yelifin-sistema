import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);
export const maxDuration = 60;

function nextDate(value: string, frequency: string, day?: number | null) {
  if (frequency === "ONCE") return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (frequency === "MONTHLY" && day) {
    date.setUTCMonth(date.getUTCMonth() + 1, 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.toISOString().slice(0, 10);
  }
  date.setUTCDate(date.getUTCDate() + (frequency === "WEEKLY" ? 7 : frequency === "BIWEEKLY" ? 14 : 30));
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const due = await sql`
      SELECT id
      FROM accounts_payable
      WHERE auto_payment_enabled = TRUE
        AND auto_payment_next_date IS NOT NULL
        AND auto_payment_next_date <= CURRENT_DATE
        AND status NOT IN ('PAID', 'CANCELLED')
      ORDER BY auto_payment_next_date, id
      LIMIT 100
    `;
    let processed = 0;
    let skipped = 0;
    for (const item of due) {
      const result = await withTransaction(async (tx) => {
        const [payable] = await tx`
          SELECT id, outstanding_amount, installment_amount, payment_frequency, auto_payment_day,
            auto_payment_account_id, auto_payment_next_date
          FROM accounts_payable
          WHERE id = ${item.id} AND auto_payment_enabled = TRUE
          FOR UPDATE
        `;
        if (!payable) return "skipped" as const;
        const [account] = await tx`
          SELECT id, balance, is_active
          FROM accounts
          WHERE id = ${payable.auto_payment_account_id}
          FOR UPDATE
        `;
        const amount = Math.min(Number(payable.installment_amount), Number(payable.outstanding_amount));
        if (!account?.is_active || !Number.isFinite(amount) || amount <= 0 || Number(account.balance ?? 0) < amount) {
          return "skipped" as const;
        }
        const now = new Date().toISOString();
        const [transaction] = await tx`
          INSERT INTO transactions (org_id, created_by, type, account_id, amount, category, description, reference_type, reference_id, occurred_at)
          SELECT ap.org_id, ap.created_by, 'EXPENSE', ${account.id}, ${amount}, 'Pagos de deudas',
            'Abono automático de cuenta por pagar', 'PAYABLE_PAYMENT', ap.id, ${now}
          FROM accounts_payable ap
          WHERE ap.id = ${payable.id}
          RETURNING id
        `;
        await tx`UPDATE accounts SET balance = balance - ${amount}, updated_at = NOW() WHERE id = ${account.id}`;
        await tx`
          INSERT INTO accounts_payable_payments (payable_id, account_id, transaction_id, amount, payment_type, paid_at, notes, created_by)
          SELECT ap.id, ${account.id}, ${transaction.id}, ${amount}, 'INSTALLMENT', ${now}, 'Abono automático', ap.created_by
          FROM accounts_payable ap WHERE ap.id = ${payable.id}
        `;
        const remaining = Math.max(0, Number(payable.outstanding_amount) - amount);
        const finished = remaining === 0;
        await tx`
          UPDATE accounts_payable
          SET outstanding_amount = ${remaining},
              status = ${finished ? "PAID" : "PARTIAL"},
              auto_payment_enabled = ${!finished},
              auto_payment_next_date = ${finished ? null : nextDate(String(payable.auto_payment_next_date), String(payable.payment_frequency), Number(payable.auto_payment_day))},
              updated_at = NOW()
          WHERE id = ${payable.id}
        `;
        return "processed" as const;
      });
      if (result === "processed") processed++;
      else skipped++;
    }
    return Response.json({ ok: true, processed, skipped });
  } catch (error) {
    console.error("GET /api/cron/payable-auto-payments:", error);
    return Response.json({ error: "Error al ejecutar abonos automáticos" }, { status: 500 });
  }
}
