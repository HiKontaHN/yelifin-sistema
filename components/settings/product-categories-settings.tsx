"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryNameDialog } from "@/components/shared/category-name-dialog";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useProductCategories, type ProductCategory } from "@/hooks/swr/use-product-categories";

type Editor = { action: "save"; category?: ProductCategory } | { action: "delete"; category: ProductCategory };

export function ProductCategoriesSettings() {
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("ADMIN", "CATEGORIES");
  const { categories, isLoading, error, saveCategory, deleteCategory } = useProductCategories();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const openEditor = (next: Editor | null) => {
    setFormError("");
    setEditor(next);
  };

  const handleDelete = async () => {
    if (editor?.action !== "delete" || submitting) return;

    setSubmitting(true);
    setFormError("");
    try {
      await deleteCategory(editor.category.id);
      toast.success("Categoría eliminada");
      openEditor(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el cambio");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorías de productos</h1>
          <p className="text-sm text-muted-foreground">Clasifica los productos y servicios de tu negocio.</p>
        </div>
        {canEdit && (
          <Button onClick={() => openEditor({ action: "save" })}>
            <Plus className="size-4" /> Nueva categoría
          </Button>
        )}
      </div>

      <Card>
        <CardContent>
          {isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando categorías…</p>
            : error ? <p role="alert" className="text-sm text-destructive">{error.message}</p>
            : categories.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay categorías de productos.</p>
            : (
              <ul className="divide-y">
                {categories.map((category) => (
                  <li key={category.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 break-words text-sm font-medium">{category.name}</span>
                    <div className="flex shrink-0 gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${category.name}`} onClick={() => openEditor({ action: "save", category })}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Eliminar ${category.name}`} onClick={() => openEditor({ action: "delete", category })}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>

      <CategoryNameDialog
        open={editor?.action === "save"}
        onOpenChange={(open) => !open && openEditor(null)}
        category={editor?.action === "save" ? editor.category : undefined}
        saveCategory={saveCategory}
      />

      <Dialog open={editor?.action === "delete"} onOpenChange={(open) => !open && !submitting && openEditor(null)}>
        <DialogContent showCloseButton={!submitting}>
          <DialogHeader>
            <DialogTitle>Eliminar categoría</DialogTitle>
            <DialogDescription>
              {editor?.action === "delete" && `¿Quieres eliminar «${editor.category.name}»?`}
            </DialogDescription>
          </DialogHeader>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => openEditor(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" loading={submitting} onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
