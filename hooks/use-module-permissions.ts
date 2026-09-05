// hooks/use-module-permissions.ts
"use client";

import { useMe } from "@/hooks/swr/use-me";
import type { OrgModule, ModulePermissions } from "@/types";

const DENY_ALL: ModulePermissions = {
  can_view: false, can_edit: false, can_delete: false,
  show_costs: false, show_profit: false,
};

export function useModulePermissions(module: OrgModule, subitem?: string): ModulePermissions & { isLoading: boolean } {
  const { isLoading, getModulePermissions } = useMe();

  if (isLoading) return { ...DENY_ALL, isLoading: true };

  return { ...getModulePermissions(module, subitem), isLoading: false };
}
