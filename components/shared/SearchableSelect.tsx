"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableSelectItem {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  items: SearchableSelectItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  defaultOption?: SearchableSelectItem;
}

export function SearchableSelect({
  value,
  onValueChange,
  items,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  className,
  disabled = false,
  defaultOption,
}: SearchableSelectProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const inputRef            = useRef<HTMLInputElement>(null);

  const allItems = defaultOption ? [defaultOption, ...items] : items;
  const filtered = search
    ? items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
    : items;

  const selectedLabel = allItems.find((i) => i.value === value)?.label ?? placeholder;

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
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
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="p-0 w-[var(--radix-popover-trigger-width)]"
      >
        {/* Buscador — mismo estilo que SearchBar */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn("pl-9", search && "pr-9")}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(""); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="max-h-60 overflow-y-auto py-1">
          {defaultOption && !search && (
            <button
              type="button"
              onClick={() => { onValueChange(defaultOption.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                value === defaultOption.value && "bg-accent/50",
              )}
            >
              <Check className={cn("size-4 shrink-0", value !== defaultOption.value && "invisible")} />
              {defaultOption.label}
            </button>
          )}

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => { onValueChange(item.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  value === item.value && "bg-accent/50",
                )}
              >
                <Check className={cn("size-4 shrink-0", value !== item.value && "invisible")} />
                {item.label}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
