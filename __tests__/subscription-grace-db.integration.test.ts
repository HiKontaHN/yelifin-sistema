import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const mockVerifyIdToken = jest.fn();
const mockCreateSessionCookie = jest.fn();

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: mockVerifyIdToken,
    createSessionCookie: mockCreateSessionCookie,
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn(async () => ({ allowed: true, remaining: 4, retryAfterSec: 0 })),
  getClientIP: jest.fn(() => "127.0.0.1"),
}));

import { NextRequest } from "next/server";
import { withTransaction, type TransactionSql } from "@/lib/db-transaction";

const describeDatabase = process.env.RUN_DB_INTEGRATION === "1"
  ? describe
  : describe.skip;

class ExpectedRollback extends Error {}

async function rollbackAfter(callback: (tx: TransactionSql) => Promise<void>) {
  try {
    await withTransaction(async (tx) => {
      await callback(tx);
      throw new ExpectedRollback("rollback intencional del test de suscripciones");
    });
  } catch (error) {
    if (!(error instanceof ExpectedRollback)) throw error;
  }
}

describeDatabase("suscripciones efectivas — integración con la base de desarrollo", () => {
  jest.setTimeout(45_000);

  it("calcula el borde de gracia, dispara el trigger y restaura el plan al pagar", async () => {
    await rollbackAfter(async (tx) => {
      const marker = `codex-grace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const [scope] = await tx<{ user_id: number; pro_id: number; free_id: number }>`
        SELECT
          (SELECT id FROM users WHERE is_active = TRUE ORDER BY id LIMIT 1) AS user_id,
          (SELECT id FROM subscription_plans WHERE slug = 'pro') AS pro_id,
          (SELECT id FROM subscription_plans WHERE slug = 'free') AS free_id
      `;
      expect(scope.user_id).toBeDefined();
      expect(scope.pro_id).toBeDefined();
      expect(scope.free_id).toBeDefined();

      const [org] = await tx<{ id: number }>`
        INSERT INTO organizations (name, slug, timezone, owner_user_id)
        VALUES (${marker}, ${marker}, 'America/Tegucigalpa', ${scope.user_id})
        RETURNING id
      `;
      await tx`
        INSERT INTO org_subscriptions (org_id, plan_id, status)
        VALUES (${org.id}, ${scope.pro_id}, 'ACTIVE')
      `;

      await tx`
        UPDATE org_subscriptions
        SET status = 'PAST_DUE', past_due_since = '2026-11-03T16:00:00Z'::timestamptz
        WHERE org_id = ${org.id}
      `;
      const [edge] = await tx<{
        grace_utc: string;
        before_edge: boolean;
        at_edge: boolean;
        past_due_since: Date | null;
      }>`
        SELECT
          to_char(grace_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS grace_utc,
          '2026-11-09T05:59:59.999999Z'::timestamptz < grace_ends_at AS before_edge,
          '2026-11-09T06:00:00Z'::timestamptz >= grace_ends_at AS at_edge,
          past_due_since
        FROM org_effective_subscriptions
        WHERE org_id = ${org.id}
      `;
      expect(edge.grace_utc).toBe("2026-11-09T06:00:00");
      expect(edge.before_edge).toBe(true);
      expect(edge.at_edge).toBe(true);
      expect(edge.past_due_since).not.toBeNull();

      await tx`
        UPDATE org_subscriptions
        SET past_due_since = NOW() - INTERVAL '20 days'
        WHERE org_id = ${org.id}
      `;
      const [degraded] = await tx<{ effective_plan_id: number; is_degraded: boolean }>`
        SELECT effective_plan_id, is_degraded
        FROM org_effective_subscriptions
        WHERE org_id = ${org.id}
      `;
      expect(Number(degraded.effective_plan_id)).toBe(Number(scope.free_id));
      expect(degraded.is_degraded).toBe(true);

      await tx`
        UPDATE org_subscriptions SET status = 'ACTIVE' WHERE org_id = ${org.id}
      `;
      const [restored] = await tx<{
        effective_plan_id: number;
        past_due_since: Date | null;
        is_degraded: boolean;
      }>`
        SELECT effective_plan_id, past_due_since, is_degraded
        FROM org_effective_subscriptions
        WHERE org_id = ${org.id}
      `;
      expect(Number(restored.effective_plan_id)).toBe(Number(scope.pro_id));
      expect(restored.past_due_since).toBeNull();
      expect(restored.is_degraded).toBe(false);
    });
  });

  it("pasa TRIAL vencido a Gratis de forma calculada, incluso con fecha nula", async () => {
    await rollbackAfter(async (tx) => {
      const marker = `codex-trial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const [scope] = await tx<{ user_id: number; trial_id: number; free_id: number }>`
        SELECT
          (SELECT id FROM users WHERE is_active = TRUE ORDER BY id LIMIT 1) AS user_id,
          (SELECT id FROM subscription_plans WHERE slug = 'trial') AS trial_id,
          (SELECT id FROM subscription_plans WHERE slug = 'free') AS free_id
      `;

      for (const [suffix, withEndDate] of [["explicit", true], ["fallback", false]] as const) {
        const [org] = await tx<{ id: number }>`
          INSERT INTO organizations (name, slug, timezone, owner_user_id, created_at)
          VALUES (${`${marker}-${suffix}`}, ${`${marker}-${suffix}`}, 'America/Tegucigalpa', ${scope.user_id}, NOW() - INTERVAL '31 days')
          RETURNING id
        `;
        await tx`
          INSERT INTO org_subscriptions (
            org_id, plan_id, status, trial_start_date, trial_end_date, created_at
          ) VALUES (
            ${org.id}, ${scope.trial_id}, 'TRIAL', NOW() - INTERVAL '31 days',
            ${withEndDate ? new Date(Date.now() - 60_000).toISOString() : null},
            NOW() - INTERVAL '31 days'
          )
        `;
        const [effective] = await tx<{
          effective_plan_id: number;
          is_trial_expired: boolean;
          is_degraded: boolean;
        }>`
          SELECT effective_plan_id, is_trial_expired, is_degraded
          FROM org_effective_subscriptions
          WHERE org_id = ${org.id}
        `;
        expect(Number(effective.effective_plan_id)).toBe(Number(scope.free_id));
        expect(effective.is_trial_expired).toBe(true);
        expect(effective.is_degraded).toBe(false);
      }
    });
  });

  it("login devuelve 403 claro a un miembro no dueño degradado", async () => {
    const marker = `codex-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let ownerId = 0;
    let memberId = 0;
    let orgId = 0;

    try {
      await withTransaction(async (tx) => {
        const [pro] = await tx<{ id: number }>`SELECT id FROM subscription_plans WHERE slug = 'pro'`;
        const [owner] = await tx<{ id: number }>`
          INSERT INTO users (firebase_uid, email, display_name)
          VALUES (${`${marker}-owner`}, ${`${marker}-owner@example.com`}, 'Dueño test')
          RETURNING id
        `;
        const [member] = await tx<{ id: number }>`
          INSERT INTO users (firebase_uid, email, display_name)
          VALUES (${`${marker}-member`}, ${`${marker}-member@example.com`}, 'Miembro test')
          RETURNING id
        `;
        ownerId = Number(owner.id);
        memberId = Number(member.id);
        const [org] = await tx<{ id: number }>`
          INSERT INTO organizations (name, slug, timezone, owner_user_id)
          VALUES (${marker}, ${marker}, 'America/Tegucigalpa', ${ownerId})
          RETURNING id
        `;
        orgId = Number(org.id);
        const [role] = await tx<{ id: number }>`
          INSERT INTO org_roles (org_id, name, is_owner)
          VALUES (${orgId}, 'Miembro test', FALSE)
          RETURNING id
        `;
        await tx`
          INSERT INTO organization_members (org_id, user_id, role_id, joined_at)
          VALUES (${orgId}, ${memberId}, ${role.id}, NOW())
        `;
        await tx`
          INSERT INTO org_subscriptions (org_id, plan_id, status, past_due_since)
          VALUES (${orgId}, ${pro.id}, 'PAST_DUE', NOW() - INTERVAL '20 days')
        `;
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: `${marker}-member`,
        email: `${marker}-member@example.com`,
        auth_time: Math.floor(Date.now() / 1000),
      });
      const { POST } = await import("@/app/api/auth/login/route");
      const response = await POST(new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ idToken: "integration-token" }),
      }));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("limitado al dueño");
      expect(mockCreateSessionCookie).not.toHaveBeenCalled();
    } finally {
      if (orgId || ownerId || memberId) {
        await withTransaction(async (tx) => {
          if (orgId) {
            await tx`DELETE FROM organization_members WHERE org_id = ${orgId}`;
            await tx`DELETE FROM org_subscriptions WHERE org_id = ${orgId}`;
            await tx`DELETE FROM org_roles WHERE org_id = ${orgId}`;
            await tx`DELETE FROM organizations WHERE id = ${orgId}`;
          }
          if (ownerId || memberId) {
            await tx`DELETE FROM user_profile WHERE user_id IN (${ownerId}, ${memberId})`;
            await tx`DELETE FROM users WHERE id IN (${ownerId}, ${memberId})`;
          }
        });
      }
    }
  });
});
