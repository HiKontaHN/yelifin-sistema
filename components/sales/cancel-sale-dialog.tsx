// components/sales/cancel-sale-dialog.tsx
"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  isLoading?: boolean;
  onConfirm: (reason?: string) => void;
};

export function CancelSaleDialog({
  open,
  onOpenChange,
  title,
  description,
  isLoading = false,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      width="sm"
      title={title}
      icon={AlertTriangle}
      iconClassName="text-destructive"
      footer={
        <>
          <Button
            variant="outline"
            className="flex-1"
            disabled={isLoading}
            onClick={() => handleOpenChange(false)}
          >
            Volver
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={isLoading}
            onClick={() => onConfirm(reason.trim() || undefined)}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Sí, cancelar venta"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>

      <div className="space-y-1.5">
        <Label htmlFor="cancellation-reason" className="text-xs text-muted-foreground">
          Motivo de la cancelación (opcional)
        </Label>
        <Textarea
          id="cancellation-reason"
          placeholder="Ej: el cliente cambió de opinión, error al registrar, etc."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isLoading}
          rows={3}
        />
      </div>
    </ResponsiveModal>
  );
}
