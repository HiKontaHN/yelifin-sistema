// types/index.ts

// ============================================
// USUARIO
// ============================================

export interface User {
  id: number;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  user_id: number;
  business_name: string | null;
  business_logo_url: string | null;
  timezone: string;
  currency: string;
  locale: string;
  onboarding_completed: boolean;
}
// ============================================
// SUSCRIPCIONES Y PLANES
// ============================================

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface SubscriptionPlan {
  id: number;
  name: string;
  slug: string;
  price_usd: number;
  billing_interval: 'MONTHLY' | 'YEARLY' | 'LIFETIME';
  limits: {
    max_products: number | null;
    max_sales_per_month: number | null;
    max_storage_mb: number | null;
  };
}

export interface UserSubscription {
  id: number;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

// ============================================
// FEATURES
// ============================================

export type FeatureCategory =
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'SALES'
  | 'CUSTOMERS'
  | 'FINANCES'
  | 'EVENTS'
  | 'REPORTS'
  | 'INTEGRATIONS'
  | 'ADMIN';

export type FeatureKey =
  // PRODUCTS
  | 'products.create'
  | 'products.variants'
  | 'products.bulk_import'
  // INVENTORY
  | 'inventory.view'
  | 'inventory.adjust'
  | 'inventory.purchases'
  // SALES
  | 'sales.create'
  | 'sales.view'
  | 'sales.reports'
  // CUSTOMERS
  | 'customers.manage'
  | 'customers.loyalty'
  // FINANCES
  | 'finances.accounts'
  | 'finances.transactions'
  | 'finances.reports'
  // EVENTS
  | 'events.manage'
  | 'events.inventory'
  // REPORTS
  | 'reports.sales'
  | 'reports.inventory'
  | 'reports.profit'
  | 'reports.events'
  | 'reports.basic'
  | 'reports.advanced'
  // ADMIN
  | 'admin.multi_user'
  | 'admin.export';

export interface Feature {
  key: FeatureKey;
  name: string;
  category: FeatureCategory;
}

export type FeaturesByCategory = Partial<Record<FeatureCategory, Feature[]>>;

// ============================================
// ORGANIZACIÓN Y ROLES
// ============================================

export type OrgModule =
  | 'DASHBOARD'
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'SALES'
  | 'CUSTOMERS'
  | 'FINANCES'
  | 'EVENTS'
  | 'REPORTS'
  | 'ADMIN';

export interface ModulePermissions {
  can_view:    boolean;
  can_edit:    boolean;
  can_delete:  boolean;
  show_costs:  boolean;
  show_profit: boolean;
}

export interface OrgInfo {
  id:          number;
  name:        string;
  slug:        string | null;
  logo_url:    string | null;
  timezone:    string;
  currency:    string;
  locale:      string;
  industry_id: number | null;
}

export interface OrgRole {
  id:       number;
  name:     string;
  is_owner: boolean;
}

export interface OrgMember {
  id:            number;
  user_id:       number;
  role_id:       number;
  is_active:     boolean;
  joined_at:     string | null;
  created_at:    string;
  email:         string;
  display_name:  string | null;
  role_name:     string;
  is_owner_role: boolean;
}

export type OrgPermissions = Partial<Record<OrgModule, ModulePermissions>>;

// ============================================
// PERFIL COMPLETO (respuesta de /api/auth/me)
// ============================================

export interface UserProfileResponse {
  user:         User;
  profile:      UserProfile;
  org:          OrgInfo;
  role:         OrgRole;
  permissions:  OrgPermissions;
  subscription: UserSubscription;
  features:     FeaturesByCategory;
}

// ============================================
// PRODUCTOS
// ============================================

export interface Product {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stock: number;
  is_service: boolean;
  variants: ProductVariant[];
  variants_count: number;
}

export interface ProductVariant {
  id: number;
  user_id: number;
  product_id: number;
  variant_name: string;
  sku: string | null;
  attributes: Record<string, string> | null;
  price_override: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// INVENTARIO
// ============================================

export interface InventoryBatch {
  id: number;
  user_id: number;
  product_id: number;
  variant_id: number | null;
  purchase_batch_item_id: number | null;
  qty_in: number;
  qty_available: number;
  unit_cost: number;
  received_at: string;
}

export interface InventoryMovement {
  id: number;
  user_id: number;
  movement_type: 'IN' | 'OUT' | 'ADJUST';
  product_id: number;
  variant_id: number | null;
  quantity: number;
  reference_type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'INITIAL' | 'SALE_CANCELLED' | 'SALE_EDITED' | null;
  reference_id: number | null;
  notes: string | null;
  created_at: string;
}

// ============================================
// COMPRAS
// ============================================

export interface PurchaseBatch {
  id: number;
  user_id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  is_paid: boolean;
  purchased_at: string;
  notes: string | null;
  created_at: string;
}

export interface PurchaseBatchItem {
  id: number;
  user_id: number;
  purchase_batch_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  unit_cost_usd: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

// ============================================
// PROVEEDORES
// ============================================

export interface Supplier {
  id: number;
  user_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

// ============================================
// CLIENTES
// ============================================

export interface Customer {
  id: number;
  user_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// VENTAS
// ============================================

export interface Sale {
  id: number;
  user_id: number;
  sale_number: string;
  customer_id: number | null;
  event_id: number | null;          
  subtotal: number;
  discount: number;
  shipping_cost: number;            
  tax: number;
  tax_rate: number;
  total: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  payment_method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED' | 'OTHER' | null;
  account_id: number | null;
  sold_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SaleItem {
  id: number;
  user_id: number;
  sale_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  created_at: string;
}

// ============================================
// INSUMOS
// ============================================

export interface Supply {
  id: number;
  user_id: number;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  unit_cost: number;
  created_at: string;
}

// ============================================
// FINANZAS
// ============================================

export interface Account {
  id: number;
  user_id: number;
  name: string;
  type: 'CASH' | 'BANK' | 'WALLET' | 'OTHER';
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  account_id: number;
  to_account_id: number | null;
  amount: number;
  category: string | null;
  description: string | null;
  reference_type: 'SALE' | 'PURCHASE' | 'SUPPLY_PURCHASE' | 'EVENT' | 'OTHER' | null;
  reference_id: number | null;
  occurred_at: string;
  created_at: string;
}

// ============================================
// EVENTOS
// ============================================

export interface Event {
  id: number;
  user_id: number;
  name: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  fixed_cost: number;
  notes: string | null;
  created_at: string;
}

export interface EventInventory {
  id: number;
  user_id: number;
  event_id: number;
  product_id: number;
  variant_id: number | null;
  planned_qty: number;
  actual_qty: number;
  sold_qty: number;
  returned_qty: number;
}

// ============================================
// API RESPONSES
// ============================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}