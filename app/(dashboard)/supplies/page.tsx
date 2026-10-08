// app/(dashboard)/supplies/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Box } from "lucide-react";

import { useSupplies, Supply } from "@/hooks/swr/use-supplies";
import { SupplyTable } from "@/components/supplies/supply-table";
import { CreateSupplyDialog } from "@/components/supplies/create-supply-dialog";
import { EditSupplyDialog } from "@/components/supplies/edit-supply-dialog";
import { DeleteSupplyDialog } from "@/components/supplies/delete-supply-dialog";
import { AddSupplyPurchaseDialog } from "@/components/supplies/add-supply-purchase-dialog";
import { Fab } from "@/components/ui/fab";
import { SearchBar } from "@/components/shared/search-bar";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { DEFAULT_DATA_TABLE_PAGE_SIZE } from "@/components/shared/data-table-time-section";

export default function SuppliesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  const debouncedSearch = useDebounce(search, 300);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { supplies, total, isLoading, mutate } = useSupplies({
    search: debouncedSearch || undefined,
    page,
    limit: pageSize,
  });

  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("INVENTORY");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSupply, setEditSupply] = useState<Supply | null>(null);
  const [deleteSupply, setDeleteSupply] = useState<Supply | null>(null);
  const [purchaseSupply, setPurchaseSupply] = useState<Supply | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suministros</h1>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre..." />
      </div>

      {/* Content */}
      <SupplyTable
        supplies={supplies}
        total={total}
        isLoading={isLoading}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
        onEdit={setEditSupply}
        onDelete={setDeleteSupply}
        onAddPurchase={setPurchaseSupply}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {/* Dialogs */}
      <CreateSupplyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => mutate()}
      />

      <EditSupplyDialog
        supply={editSupply}
        open={!!editSupply}
        onOpenChange={(open) => !open && setEditSupply(null)}
        onSuccess={() => mutate()}
      />

      <DeleteSupplyDialog
        supply={deleteSupply}
        open={!!deleteSupply}
        onOpenChange={(open) => !open && setDeleteSupply(null)}
        onSuccess={() => mutate()}
      />

      <AddSupplyPurchaseDialog
        supply={purchaseSupply}
        open={!!purchaseSupply}
        onOpenChange={(open) => !open && setPurchaseSupply(null)}
        onSuccess={() => mutate()}
      />

      {canEdit && (
        <Fab
          actions={[
            { label: "Nuevo suministro", icon: Box, onClick: () => setCreateOpen(true) },
          ]}
        />
      )}
    </div>
  );
}
