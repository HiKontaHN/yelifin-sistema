"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface SearchableSelectItem {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  items: SearchableSelectItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  defaultOption?: SearchableSelectItem;
}

export function SearchableSelect({
  id,
  value,
  onValueChange,
  items,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  className,
  contentClassName,
  align = "start",
  disabled = false,
  defaultOption,
}: SearchableSelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visualBounds, setVisualBounds] = useState<{ top: number; maxHeight: number } | undefined>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Dentro de una modal, montar el popover en el DialogContent evita que el
  // scroll-lock de Radix bloquee la rueda del mouse sobre la lista.
  const portalContainer = open && !isMobile
    ? triggerRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]')
    : undefined;

  const allItems = defaultOption ? [defaultOption, ...items] : items;
  const filtered = search
    ? items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const selectedLabel = allItems.find((i) => i.value === value)?.label ?? placeholder;

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isMobile || !open || !viewport) return;

    const updateBounds = () => {
      const { height, offsetTop } = viewport;
      setVisualBounds(height < window.innerHeight - 1 || offsetTop !== 0
        ? { top: offsetTop + height / 2, maxHeight: height * 0.8 }
        : undefined);
    };

    viewport.addEventListener("resize", updateBounds);
    viewport.addEventListener("scroll", updateBounds);
    updateBounds();
    return () => {
      viewport.removeEventListener("resize", updateBounds);
      viewport.removeEventListener("scroll", updateBounds);
      setVisualBounds(undefined);
    };
  }, [isMobile, open]);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen || !disabled) setOpen(nextOpen);
  };

  const trigger = (
    <button
      id={id}
      ref={triggerRef}
      type="button"
      role={isMobile ? undefined : "combobox"}
      aria-expanded={open}
      disabled={disabled}
      className={cn(
        "flex h-9 items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm",
        "hover:bg-accent hover:text-accent-foreground transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span className="truncate text-left">{selectedLabel}</span>
      <ChevronDown
        className={cn(
          "ml-2 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </button>
  );

  const searchAndOptions = (
    <>
      <div className={cn("shrink-0 border-b", isMobile ? "px-4 pb-3" : "p-2")}>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={cn("pl-9 [&::-webkit-search-cancel-button]:hidden", isMobile && "h-10", search && "pr-9")}
          />
          {search && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      <div className={cn(
        "overflow-y-auto overscroll-contain py-1",
        isMobile ? "min-h-0 flex-1 px-2 [scrollbar-width:thin]" : "max-h-60 px-1",
      )}>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No se encontraron resultados</p>
        ) : filtered.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={value === item.value}
            onClick={() => { onValueChange(item.value); setOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
              isMobile && "min-h-11",
              value === item.value && "bg-accent/50",
            )}
          >
            <Check aria-hidden="true" className={cn("size-4 shrink-0", value !== item.value && "invisible")} />
            <span className="min-w-0 wrap-break-word">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[80dvh] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[90vw]"
          style={visualBounds}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">Seleccionar opción</DialogTitle>
            <DialogDescription className="sr-only">Busca y elige una opción de la lista.</DialogDescription>
            <DialogClose asChild>
              <button type="button" aria-label="Cerrar selector" className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-5" />
              </button>
            </DialogClose>
          </div>
          {searchAndOptions}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        align={align}
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn("p-0 w-[var(--radix-popover-trigger-width)]", contentClassName)}
      >
        {searchAndOptions}
      </PopoverContent>
    </Popover>
  );
}
