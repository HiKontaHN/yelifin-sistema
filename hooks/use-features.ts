// hooks/use-features.ts
'use client';

import { useAuth } from './use-auth';
import { FeatureKey, FeatureCategory } from '@/types';

export function useFeatures() {
  const { user } = useAuth();
  const features = user?.features ?? {};

  const hasFeature = (featureKey: FeatureKey): boolean => {
    return Object.values(features)
      .flat()
      .some((f) => f.key === featureKey);
  };

  const getFeaturesByCategory = (category: FeatureCategory) => {
    return features[category] ?? [];
  };

  return {
    features,
    hasFeature,
    getFeaturesByCategory,
    // Shortcuts con las FeatureKey del nuevo schema
    canCreateProducts:    hasFeature('products.create'),
    canCreateVariants:    hasFeature('products.variants'),
    canBulkImport:        hasFeature('products.bulk_import'),
    canViewInventory:     hasFeature('inventory.view'),
    canAdjustInventory:   hasFeature('inventory.adjust'),
    canManagePurchases:   hasFeature('inventory.purchases'),
    canViewMovements:     hasFeature('inventory.movements'),
    canCreateSales:       hasFeature('sales.create'),
    canViewSales:         hasFeature('sales.view'),
    canViewSalesReports:  hasFeature('sales.reports'),
    canManageCustomers:   hasFeature('customers.manage'),
    canManageLoyalty:     hasFeature('customers.loyalty'),
    canManageAccounts:    hasFeature('finances.accounts'),
    canManageTransactions:hasFeature('finances.transactions'),
    canManageCreditCards: hasFeature('finances.credit_cards'),
    canManageCategories:  hasFeature('finances.custom_categories'),
    canViewFinanceReports:hasFeature('finances.reports'),
    canManageEvents:      hasFeature('events.manage'),
    canManageEventInv:    hasFeature('events.inventory'),
    hasBasicReports:      hasFeature('reports.basic'),
    hasAdvancedReports:   hasFeature('reports.advanced'),
    hasMultiUser:         hasFeature('admin.multi_user'),
    canExport:            hasFeature('admin.export'),
  };
}
