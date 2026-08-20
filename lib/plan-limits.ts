// lib/plan-limits.ts
//
// Temporary, hardcoded stand-in for real plan-based limits (see the
// Gratis/Básico/Pro matrix in components/landing/landing-pricing.tsx).
// Full enforcement — reading org_subscriptions/subscription_plans and
// checking per-feature — isn't built yet (every new signup gets a
// 30-day "trial" subscription with no real limits attached). Until
// that lands, onboarding caps new accounts at what the Gratis plan
// promises, so nobody sets up more than they'll keep once the trial
// ends. Shared by app/(auth)/onboarding/page.tsx (client-side disable)
// and app/api/onboarding/route.tsx (server-side enforcement) so the
// two can't drift out of sync.
export const FREE_PLAN_MAX_ACCOUNTS = 2;
