// components/shared/responsive-modal.tsx
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
const SHEET_MEDIA_QUERY = "(width < 40rem)";
const SHEET_TOP_GAP = 8;
const DRAG_THRESHOLD = 8;
const SNAP_THRESHOLD = 24;
const INTERACTIVE_HEADER_ELEMENTS = "button, a, input, select, textarea, label, summary, [role='button'], [role='combobox'], [contenteditable]";

type SheetGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  startHeight: number;
  maxHeight: number;
  dragging: boolean;
};

type SheetPreview = { offset: number; height?: number };

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
  /** Si es false, desactiva el arrastre desde el encabezado en móvil. */
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
  const gestureRef = React.useRef<SheetGesture | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [dragPreview, setDragPreview] = React.useState<SheetPreview | null>(null);

  // ── Teclado virtual (móvil) ─────────────────────────────────────────
  // La modal es un bottom sheet fixed a bottom:0 del viewport de layout.
  // Cuando el teclado aparece, el visualViewport se achica pero bottom:0
  // sigue anclado al fondo de la página completa — que ahora queda detrás
  // del teclado — y tapa la mitad de abajo de la modal (típicamente el
  // footer con los botones). El meta viewport (app/layout.tsx,
  // interactiveWidget: "resizes-content") ya resuelve esto en Chrome/Android;
  // este listener es el respaldo para navegadores que no lo soportan
  // (Safari/iOS en versiones viejas).
  const [keyboardFix, setKeyboardFix] = React.useState<{ bottom: number; maxHeight: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (!window.matchMedia(SHEET_MEDIA_QUERY).matches) { setKeyboardFix(null); return; }
      const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      if (inset <= 0) { setKeyboardFix(null); return; }
      setKeyboardFix({ bottom: inset, maxHeight: Math.round(vv.height) - 16 });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKeyboardFix(null);
    };
  }, [open]);

  React.useEffect(() => {
    if (open && dragToClose) return;
    gestureRef.current = null;
    setDragPreview(null);
    if (!open) setExpanded(false);
  }, [open, dragToClose]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const sheet = contentRef.current;
    const target = event.target;
    if (!sheet || !open || !dragToClose || gestureRef.current || !event.isPrimary || event.button !== 0
      || !window.matchMedia(SHEET_MEDIA_QUERY).matches
      || !(target instanceof Element) || !event.currentTarget.contains(target)
      || target.closest(INTERACTIVE_HEADER_ELEMENTS)) return;

    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      startHeight: sheet.offsetHeight,
      maxHeight: Math.max(sheet.offsetHeight, keyboardFix?.maxHeight ?? visibleHeight - SHEET_TOP_GAP),
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      const dx = Math.abs(event.clientX - gesture.startX);
      if (dx >= DRAG_THRESHOLD && dx > Math.abs(dy)) {
        gestureRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      gesture.dragging = true;
    }

    setDragPreview(dy < 0
      ? { offset: 0, height: Math.min(gesture.maxHeight, gesture.startHeight - dy) }
      : { offset: dy });
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gestureRef.current = null;
    setDragPreview(null);
    if (event.type !== "pointerup" || !gesture.dragging || !dragToClose
      || !window.matchMedia(SHEET_MEDIA_QUERY).matches) return;

    const dy = event.clientY - gesture.startY;
    const velocity = dy / Math.max(event.timeStamp - gesture.startedAt, 1);
    if (dy > gesture.startHeight * 0.35 || (dy > 60 && velocity > 0.5)) {
      onOpenChange(false);
    } else if (dy <= -SNAP_THRESHOLD) {
      setExpanded(true);
    } else if (dy >= SNAP_THRESHOLD && expanded) {
      setExpanded(false);
    }
  };

  const bodyProps = {
    ...(as === "form" ? formProps : {}),
    className: cn("min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4", bodyClassName),
    children,
  };
  const contentStyle = {
    ...keyboardFix,
    "--responsive-modal-offset": dragPreview ? `${dragPreview.offset}px` : undefined,
    "--responsive-modal-height": dragPreview?.height !== undefined ? `${dragPreview.height}px` : undefined,
  } as React.CSSProperties;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        style={contentStyle}
        className={cn(
          "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-[var(--responsive-modal-offset,0px)]",
          "w-full max-w-full rounded-t-xl rounded-b-none border-t border-x-0 border-b-0",
          HEIGHT_CLASSES[height],
          "flex flex-col overflow-visible p-0",
          "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-full",
          WIDTH_CLASSES[width],
          "min-h-[50dvh] sm:min-h-0",
          "sm:rounded-xl sm:border",
          (expanded || dragPreview?.height !== undefined) &&
            "max-sm:h-[var(--responsive-modal-height,calc(100dvh-8px))] max-sm:max-h-[calc(100dvh-8px)]",
          !dragPreview && "max-sm:transition-[translate] max-sm:ease-out motion-reduce:transition-none",
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
        <div
          data-slot="responsive-modal-drag-region"
          className={cn("shrink-0", dragToClose && "max-sm:touch-none max-sm:cursor-grab max-sm:select-none max-sm:active:cursor-grabbing")}
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
        >
          {showDragHandle && (
            <div aria-hidden="true" className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
          )}

          {(header || title) && (
            <DialogHeader className="shrink-0 border-b px-5 pt-2 pb-3 sm:pt-5">
              {header ?? (
                <>
                  <DialogTitle className={cn("flex items-center gap-2 text-lg font-bold", titleClassName)}>
                    {Icon && <Icon className={cn("size-4 text-primary", iconClassName)} />}
                    {title}
                  </DialogTitle>
                  {subtitle && (
                    <p className="text-left text-xs text-muted-foreground">{subtitle}</p>
                  )}
                </>
              )}
            </DialogHeader>
          )}
        </div>

        <DialogDescription className="sr-only">
          {subtitle ?? (title ? `Opciones para ${title}` : "Contenido del diálogo")}
        </DialogDescription>

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
