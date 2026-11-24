"use client";

import { useId, useState } from "react";

import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProductCategories } from "@/hooks/swr/use-product-categories";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { CategoryNameDialog } from "@/components/shared/category-name-dialog";

export function ProductCategoryField({ value, onChange, open, disabled }: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  open: boolean;
  disabled: boolean;
}) {
  const id = useId();
  const { categories, isLoading, error, saveCategory } = useProductCategories(open);
  const { can_edit: canCreateCategory } = useModulePermissions("ADMIN", "CATEGORIES");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Categoría <span className="text-xs font-normal text-muted-foreground">opcional</span></Label>
      <div className="flex items-center gap-2">
        <SearchableSelect
          id={id}
          value={value == null ? "" : String(value)}
          onValueChange={(selected) => onChange(selected ? Number(selected) : null)}
          items={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          defaultOption={{ value: "", label: "Sin categoría" }}
          placeholder={isLoading ? "Cargando categorías…" : "Seleccionar categoría"}
          searchPlaceholder="Buscar categoría…"
          disabled={disabled || isLoading || categories.length === 0}
          className="h-11 min-w-0 flex-1"
        />
        {canCreateCategory && (
          <CategoryNameDialog
            open={open && categoryDialogOpen}
            onOpenChange={setCategoryDialogOpen}
            saveCategory={saveCategory}
            onSaved={(category) => onChange(Number(category.id))}
            trigger={<Button type="button" variant="outline" className="h-11 px-3" disabled={disabled}>Crear categoría</Button>}
          />
        )}
      </div>
      {error ? (
        <p className="text-xs text-muted-foreground">No se pudieron cargar las categorías.</p>
      ) : !isLoading && categories.length === 0 && !canCreateCategory ? (
        <p className="text-xs text-muted-foreground">Crea categorías en Configuración → Categorías → Productos.</p>
      ) : null}
    </div>
  );
}
