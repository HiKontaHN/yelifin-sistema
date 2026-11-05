// hooks/use-subscription.ts
'use client';

import { useAuth } from './use-auth';
import { FeatureKey } from '@/types';

export function useSubscription() {
  const { user } = useAuth();
  const subscription = user?.subscription;
  const features = user?.features;

  const status = subscription?.status;
  const planSlug = subscription?.plan?.slug ?? 'trial';
  const planName = subscription?.plan?.name ?? 'Trial';
  const limits = subscription?.plan?.limits;
  const graceEndsAt = subscription?.grace_ends_at ?? null;
  const isDegraded = subscription?.is_degraded ?? false;

  // Estado de la suscripción
  const isPastDue = status === 'PAST_DUE';
  const isActive = status === 'TRIAL' || status === 'ACTIVE' || isPastDue;
  const isExpired = status === 'EXPIRED' || status === 'CANCELLED';
  const isTrial = status === 'TRIAL' && !subscription?.is_trial_expired;
  const isPro = planSlug === 'pro';
  const isOriginal = planSlug === 'original';

  // Verificar acceso a una feature
  const hasFeature = (featureKey: FeatureKey): boolean => {
    if (!features) return false;
    return Object.values(features)
      .flat()
      .some((f) => f.key === featureKey);
  };

  // Verificar si está cerca del límite de un recurso (80%)
  const isNearLimit = (
    resourceType: 'products' | 'sales',
    currentCount: number
  ): boolean => {
    if (!limits) return false;
    const limitValue =
      resourceType === 'products'
        ? limits.max_products
        : limits.max_sales_per_month;
    if (limitValue === null) return false; // sin límite
    return currentCount >= limitValue * 0.8;
  };

  // Verificar si alcanzó el límite
  const hasReachedLimit = (
    resourceType: 'products' | 'sales',
    currentCount: number
  ): boolean => {
    if (!limits) return false;
    const limitValue =
      resourceType === 'products'
        ? limits.max_products
        : limits.max_sales_per_month;
    if (limitValue === null) return false; // sin límite
    return currentCount >= limitValue;
  };

  // Porcentaje de uso de un recurso
  const getUsagePercentage = (
    resourceType: 'products' | 'sales',
    currentCount: number
  ): number => {
    if (!limits) return 0;
    const limitValue =
      resourceType === 'products'
        ? limits.max_products
        : limits.max_sales_per_month;
    if (limitValue === null) return 0; // sin límite
    return Math.min(Math.round((currentCount / limitValue) * 100), 100);
  };

  // Límite formateado para mostrar en UI ("10 productos", "Ilimitado")
  const getLimitLabel = (resourceType: 'products' | 'sales'): string => {
    if (!limits) return 'Ilimitado';
    const limitValue =
      resourceType === 'products'
        ? limits.max_products
        : limits.max_sales_per_month;
    if (limitValue === null) return 'Ilimitado';
    return resourceType === 'products'
      ? `${limitValue} productos`
      : `${limitValue} ventas/mes`;
  };

  return {
    subscription,
    status,
    planSlug,
    planName,
    limits,
    features,
    isActive,
    isExpired,
    isPastDue,
    graceEndsAt,
    isDegraded,
    isTrial,
    isPro,
    isOriginal,
    hasFeature,
    isNearLimit,
    hasReachedLimit,
    getUsagePercentage,
    getLimitLabel,
  };
}
