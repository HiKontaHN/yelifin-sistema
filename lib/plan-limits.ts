// lib/plan-limits.ts
//
// Límite específico del formulario inicial. La suscripción y las features
// del plan se validan en el API mediante los helpers de lib/auth.ts.
// Se comparte entre la pantalla y el endpoint de onboarding para que el
// máximo mostrado durante ese flujo no se desincronice.
export const FREE_PLAN_MAX_ACCOUNTS = 2;
