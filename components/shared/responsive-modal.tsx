// components/shared/responsive-modal.tsx
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ModalWidth = "sm" | "md" | "wide" | "xl" | "2xl";
type ModalHeight = "default" | "tall" | "compact";

// Estas clases se escriben literalmente (no se interpolan) para que Tailwind
// las detecte al escanear este archivo, sin importar qué variante se use en runtime.
const WIDTH_CLASSES: Record<ModalWidth, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  wide: "sm:max-w-md lg:max-w-xl xl:max-w-xl",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-lg lg:max-w-2xl",
};

const HEIGHT_CLASSES: Record<ModalHeight, string> = {
  default: "max-h-[92dvh] sm:max-h-[88vh]",
  tall: "max-h-[92dvh] sm:max-h-[90vh]",
  compact: "max-h-[80dvh] sm:max-h-[80vh]",
};

// La modal se comporta como bottom sheet por debajo de este ancho (breakpoint sm)
const SHEET_MEDIA_QUERY = "(max-width: 639px)";

type ResponsiveModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título simple (junto con `icon`/`subtitle` opcionales). Ignorado si se pasa `header`. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  iconClassName?: string;
  titleClassName?: string;
  /** Reemplaza por completo el header por defecto (debe incluir su propio DialogTitle). */
  header?: React.ReactNode;
  /** Contenido fijo (no scrollea) entre el header y el body, p.ej. un resumen. */
  topContent?: React.ReactNode;
  children: React.ReactNode;
  /** Botones fijos al fondo de la modal. */
  footer?: React.ReactNode;
  /** Usa "form" cuando el body debe ser un <form> (p.ej. con react-hook-form). */
  as?: "div" | "form";
  formProps?: React.ComponentPropsWithoutRef<"form">;
  width?: ModalWidth;
  height?: ModalHeight;
  /** Si es false, permite cerrar al hacer click fuera (por defecto se previene). */
  preventOutsideClose?: boolean;
  showDragHandle?: boolean;
  /** Si es false, desactiva el gesto de arrastrar hacia abajo para cerrar (móvil). */
  dragToClose?: boolean;
  bodyClassName?: string;
  contentClassName?: string;
};

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  titleClassName,
  header,
  topContent,
  children,
  footer,
  as = "div",
  formProps,
  width = "md",
  height = "default",
  preventOutsideClose = true,
  showDragHandle = true,
  dragToClose = true,
  bodyClassName,
  contentClassName,
}: ResponsiveModalProps) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLElement | null>(null);

  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // ── Gesto: arrastrar hacia abajo para cerrar (solo en modo bottom sheet) ──
  // Usa Pointer Events, así funciona con dedo Y con mouse (DevTools/ventana
  // angosta). Sigue el puntero y cierra por distancia (>35% de la altura) o
  // por velocidad. Si el gesto empieza dentro del body con scroll pendiente
  // hacia arriba (scrollTop > 0), se ignora y el scroll funciona normal.
  React.useEffect(() => {
    if (!open || !dragToClose) return;
    const el = contentRef.current;
    if (!el) return;

    let startY = 0;
    let dy = 0;
    let startedAt = 0;
    let dragging = false;
    let allowed = false;
    let closing = false;

    const isSheet = () => window.matchMedia(SHEET_MEDIA_QUERY).matches;

    const onPointerDown = (e: PointerEvent) => {
      if (!isSheet() || closing) { allowed = false; return; }
      if (e.pointerType === "mouse" && e.button !== 0) { allowed = false; return; }
      const body = bodyRef.current;
      const target = e.target as Node;
      // Permitir el gesto si empieza fuera del área scrolleable
      // o si esa área está en el tope (nada que scrollear hacia arriba)
      allowed = !body || !body.contains(target) || body.scrollTop <= 0;
      startY = e.clientY;
      startedAt = Date.now();
      dy = 0;
      dragging = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!allowed || closing) return;
      dy = e.clientY - startY;

      if (!dragging) {
        // Umbral para no interferir con taps ni con scroll hacia arriba
        if (dy > 12) {
          dragging = true;
          try { el.setPointerCapture(e.pointerId); } catch { /* no-op */ }
          el.style.userSelect = "none";
        } else {
          return;
        }
      }

      if (dy < 0) dy = 0;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
    };

    // En táctil, impedir que el navegador convierta el gesto en scroll:
    // si el body está en el tope y el dedo va hacia abajo, el scroll no
    // tiene a dónde ir — se cancela desde el primer move para que los
    // pointermove sigan llegando.
    const onTouchMove = (e: TouchEvent) => {
      if (!allowed || closing || !e.cancelable) return;
      const delta = e.touches[0].clientY - startY;
      if (delta > 0) e.preventDefault();
    };

    const settle = () => {
      allowed = false;
      if (!dragging || closing) { dragging = false; return; }
      el.style.userSelect = "";

      const elapsed = Math.max(Date.now() - startedAt, 1);
      const velocity = dy / elapsed; // px/ms
      const shouldClose = dy > el.offsetHeight * 0.35 || (velocity > 0.5 && dy > 60);

      el.style.transition = "transform 0.22s ease-out";
      if (shouldClose) {
        closing = true;
        el.style.transform = "translateY(100%)";
        window.setTimeout(() => onOpenChangeRef.current(false), 180);
      } else {
        el.style.transform = "";
      }
      dragging = false;
      dy = 0;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", settle);
    el.addEventListener("pointercancel", settle);
    // passive:false es necesario para poder hacer preventDefault del scroll
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", settle);
      el.removeEventListener("pointercancel", settle);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [open, dragToClose]);

  const bodyProps = {
    ...(as === "form" ? formProps : {}),
    ref: (node: HTMLElement | null) => { bodyRef.current = node; },
    className: cn("flex-1 overflow-y-auto px-5 py-4 space-y-4", bodyClassName),
    children,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0",
          "w-full max-w-full rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0",
          HEIGHT_CLASSES[height],
          "flex flex-col p-0",
          "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-full",
          WIDTH_CLASSES[width],
          "sm:rounded-2xl sm:border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-[48%]",
          "data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-[48%]",
          "duration-300",
          contentClassName,
        )}
        onInteractOutside={preventOutsideClose ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onOpenChange(false);
        }}
      >
        {showDragHandle && (
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0" style={{ touchAction: "none" }}>
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {(header || title) && (
          <DialogHeader className="shrink-0 px-5 pt-2 pb-3 sm:pt-5 border-b">
            {header ?? (
              <>
                <DialogTitle className={cn("flex items-center gap-2 text-lg font-bold", titleClassName)}>
                  {Icon && <Icon className={cn("size-4 text-primary", iconClassName)} />}
                  {title}
                </DialogTitle>
                {subtitle && (
                  <p className="text-xs text-muted-foreground text-left">{subtitle}</p>
                )}
              </>
            )}
          </DialogHeader>
        )}

        {topContent}

        {React.createElement(as, bodyProps as any)}

        {footer && (
          <div  className="shrink-0 px-5 py-4 border-t bg-transparent xl:bg-transparent md:bg-transparent sm:bg-background flex gap-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
