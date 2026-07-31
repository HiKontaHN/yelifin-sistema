// components/shared/confirm-dialog.tsx
"use client";

import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";

type ConfirmDialogVariant = "default" | "danger" | "warning";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  isLoading?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  isLoading = false,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDanger = variant === "danger";
  const isWarning = variant === "warning";

  const Icon = isDanger ? AlertTriangle : isWarning ? Clock : CheckCircle2;

  const iconStyles = isDanger
    ? "bg-destructive/10 text-destructive"
    : isWarning
    ? "bg-amber-500/10 text-amber-600"
    : "bg-primary/10 text-primary";

  const confirmStyles = isDanger
    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
    : isWarning
    ? "bg-amber-500 text-white hover:bg-amber-600"
    : "bg-primary text-primary-foreground hover:bg-primary/90";

  const closeDialog = () => {
    if (!isLoading) onOpenChange(false);
  };

  return (
    <div
      className="
        fixed inset-0 z-[60]
        flex items-end justify-center
        bg-black/50
        p-4
        sm:items-center
        pointer-events-auto
      "
      onClick={closeDialog}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        className="
          w-full
          rounded-2xl
          bg-background
          shadow-2xl
          animate-in
          slide-in-from-bottom-4
          duration-200

          sm:max-w-sm
          sm:zoom-in-95
        "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4">
          <div className="mb-3 flex items-center gap-3">
            <div
              className={`
                flex size-10 shrink-0 items-center justify-center rounded-full
                ${iconStyles}
              `}
            >
              <Icon className="size-5" />
            </div>

            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold"
            >
              {title}
            </h2>
          </div>

          {description && (
            <p
              id="confirm-dialog-description"
              className="text-sm leading-relaxed text-muted-foreground"
            >
              {description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-6 pb-6">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`
              w-full rounded-xl py-2.5 text-sm font-semibold
              transition-colors cursor-pointer
              disabled:pointer-events-none disabled:opacity-60
              ${confirmStyles}
            `}
          >
            {isLoading ? "Procesando..." : confirmLabel}
          </button>

          <button
            type="button"
            onClick={closeDialog}
            disabled={isLoading}
            className="
              w-full rounded-xl border border-border py-2.5
              text-sm font-medium
              transition-colors cursor-pointer
              hover:bg-muted
              disabled:pointer-events-none disabled:opacity-60
            "
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}