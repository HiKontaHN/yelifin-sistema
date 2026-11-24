"use client";

import { useEffect, useId, useState, type FormEvent, type ReactElement } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type NamedCategory = { id: number; name: string };

export function CategoryNameDialog({ open, onOpenChange, category, trigger, saveCategory, onSaved, title, description }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: NamedCategory;
  trigger?: ReactElement;
  saveCategory: (name: string, id?: number) => Promise<NamedCategory>;
  onSaved?: (category: NamedCategory) => void;
  title?: string;
  description?: string;
}) {
  const nameId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setError("");
    }
  }, [open, category?.id, category?.name]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // React propaga eventos a través del portal hasta el formulario principal.
    event.stopPropagation();
    if (submitting || !name.trim()) return;

    setSubmitting(true);
    setError("");
    try {
      const saved = await saveCategory(name.trim(), category?.id);
      onSaved?.(saved);
      toast.success(category ? "Categoría actualizada" : "Categoría creada");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la categoría");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{title ?? (category ? "Editar categoría" : "Crear categoría")}</DialogTitle>
          <DialogDescription>{description ?? "Escribe el nombre de la categoría."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Nombre</Label>
            <Input
              id={nameId}
              value={name}
              maxLength={100}
              required
              disabled={submitting}
              onChange={(event) => { setName(event.target.value); setError(""); }}
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={submitting} disabled={!name.trim()}>Guardar categoría</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
