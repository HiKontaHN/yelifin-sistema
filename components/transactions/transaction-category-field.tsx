"use client";

import { useId, useState } from "react";

import { CategoryNameDialog } from "@/components/shared/category-name-dialog";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useFeatures } from "@/hooks/use-features";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useCreateCategory, useTransactionCategories, type TransactionCategory } from "@/hooks/swr/use-transaction-categories";

const TYPE_LABELS = { INCOME: "ingresos", EXPENSE: "egresos", TRANSFER: "transferencias" };

export function TransactionCategoryField({ type, value, onChange, disabled }: {
  type: TransactionCategory["type"];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const fieldId = useId();
  const [registerOpen, setRegisterOpen] = useState(false);
  const { categories, mutate } = useTransactionCategories(type);
  const { create } = useCreateCategory();
  const { canManageCategories } = useFeatures();
  const { can_edit: canEdit } = useModulePermissions("ADMIN", "CATEGORIES");

  const registerCategory = async (name: string) => {
    const saved = await create({ name, type });
    await mutate((current) => {
      const previous = current?.data ?? [];
      const items = [...previous.filter((category) => category.id !== saved.id), saved];
      items.sort((a, b) => a.name.localeCompare(b.name, "es"));
      return { ...current, data: items, total: items.length };
    }, { revalidate: true });
    return saved;
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} className="text-sm font-medium">
        Categoría <span className="text-xs font-normal text-muted-foreground">opcional</span>
      </Label>
      <div className="flex items-center gap-2">
        <SearchableSelect
          id={fieldId}
          value={value}
          onValueChange={onChange}
          items={categories.filter((category) => category.is_active).map((category) => ({
            value: category.name,
            label: category.name,
          }))}
          placeholder="Sin categoría"
          searchPlaceholder="Buscar categoría…"
          defaultOption={{ value: "", label: "Sin categoría" }}
          disabled={disabled}
          className="h-11 min-w-0 flex-1"
        />
        {canManageCategories && canEdit && (
          <CategoryNameDialog
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            saveCategory={registerCategory}
            onSaved={(category) => onChange(category.name)}
            title="Registrar categoría"
            description={`La categoría se guardará para ${TYPE_LABELS[type]}.`}
            trigger={<Button type="button" variant="outline" className="h-11 px-3" disabled={disabled}>Registrar categoría</Button>}
          />
        )}
      </div>
    </div>
  );
}
