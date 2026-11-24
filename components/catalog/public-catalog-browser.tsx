"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, Store } from "lucide-react";

import { CatalogCartSheet } from "@/components/catalog/catalog-cart-sheet";
import { CatalogItemCard } from "@/components/catalog/catalog-item-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCatalogStock, type CatalogStockStatus } from "@/hooks/use-catalog-stock";
import { buildCatalogCartLines, changeCatalogQuantity, readCatalogCart, type CatalogCart } from "@/lib/catalog-cart";
import { getCatalogItemAvailability } from "@/lib/catalog-stock";
import type { PublicCatalog } from "@/lib/public-catalog";

type Filter = "all" | "products" | "services";
type StockFilter = "available" | "out" | "all";
const PAGE_SIZE = 12;

const STOCK_LABEL: Record<CatalogStockStatus, string> = {
  checking: "Actualizando inventario…",
  live: "Inventario en vivo",
  updated: "Inventario actualizado",
  offline: "Últimas cantidades conocidas",
  unavailable: "Catálogo no disponible",
};

export function PublicCatalogBrowser({ catalogId, catalog, header, realtime }: {
  catalogId: string;
  catalog: PublicCatalog;
  header: ReactNode;
  realtime: boolean;
}) {
  const { items, organization, contacts } = catalog;
  const { stock, status } = useCatalogStock(catalogId, catalog.stock, realtime, items.length > 0);
  const [filter, setFilter] = useState<Filter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("available");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<CatalogCart>({});
  const [loadedCart, setLoadedCart] = useState(false);
  const storageKey = `hikonta:catalog-cart:${catalogId}`;

  useEffect(() => {
    try {
      setCart(readCatalogCart(localStorage.getItem(storageKey)));
    } catch {
      setCart({});
    }
    setLoadedCart(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loadedCart) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // El carrito sigue funcionando durante esta visita sin almacenamiento.
    }
  }, [cart, loadedCart, storageKey]);

  const formatter = useMemo(
    () => new Intl.NumberFormat(organization.locale, { style: "currency", currency: organization.currency }),
    [organization.locale, organization.currency],
  );
  const lines = useMemo(() => buildCatalogCartLines(items, cart, stock), [items, cart, stock]);
  const published = useMemo(() => items.filter((item) => stock[item.id] !== undefined), [items, stock]);
  const showTabs = published.some((item) => item.is_service) && published.some((item) => !item.is_service);
  const hasProducts = published.some((item) => !item.is_service);
  const searching = Boolean(search.trim());
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(organization.locale);
    return published.filter((item) => {
      if (showTabs && filter === "products" && item.is_service) return false;
      if (showTabs && filter === "services" && !item.is_service) return false;
      if (query) {
        return item.name.toLocaleLowerCase(organization.locale).includes(query)
          || item.description?.toLocaleLowerCase(organization.locale).includes(query);
      }
      const available = getCatalogItemAvailability(item, stock);
      if (!hasProducts || (showTabs && filter === "services")) return true;
      if (stockFilter === "out") return available === 0;
      return stockFilter === "all" || available === null || (available ?? 0) > 0;
    });
  }, [filter, hasProducts, organization.locale, published, search, showTabs, stock, stockFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const from = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visibleItems.slice(from, from + PAGE_SIZE);
  const resultsClassName = "mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8";

  function goToPage(nextPage: number) {
    setPage(nextPage);
    window.scrollTo({ top: 0 });
  }

  function setQuantity(id: string, quantity: number) {
    setCart((current) => changeCatalogQuantity(current, id, quantity, stock[id]));
  }

  function add(id: string) {
    setCart((current) => changeCatalogQuantity(current, id, (current[id] ?? 0) + 1, stock[id]));
  }

  const results = pageItems.length > 0 ? (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pageItems.map((item) => <CatalogItemCard key={item.id} item={item} formatter={formatter} stock={stock} cart={cart} add={add} />)}
      </div>
      {pageCount > 1 && (
        <nav aria-label="Páginas del catálogo" className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">Página {currentPage} de {pageCount}</p>
          <Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => goToPage(currentPage + 1)}>
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </nav>
      )}
    </>
  ) : (
    <div className="rounded-2xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
      {searching ? "No encontramos productos o servicios con esa búsqueda." : "No hay artículos con esta disponibilidad."}
    </div>
  );

  return (
    <Tabs value={filter} onValueChange={(value) => { setFilter(value as Filter); setPage(1); }} className="gap-0">
      <div className="sticky top-0 z-30 bg-background">
        <header className="border-b bg-card">
          <nav aria-label="Barra del catálogo" className="mx-auto flex min-h-16 max-w-7xl items-center gap-2 px-4 py-2 sm:gap-4 sm:px-6 lg:px-8">
            {header}
            {(published.length > 0 || lines.length > 0) && (
              <CatalogCartSheet contacts={contacts} lines={lines} formatter={formatter} setQuantity={setQuantity} />
            )}
            <ThemeToggle isCollapsed />
          </nav>
        </header>
        {published.length > 0 && (
          <div className="border-b">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8">
              {showTabs && (
                <TabsList aria-label="Filtrar catálogo" className="grid w-full grid-cols-3 border-0 sm:w-auto">
                  <TabsTrigger value="all" className="py-2">Todo</TabsTrigger>
                  <TabsTrigger value="products" className="py-2">Productos</TabsTrigger>
                  <TabsTrigger value="services" className="py-2">Servicios</TabsTrigger>
                </TabsList>
              )}
              <div className="relative min-w-0 flex-[1_1_8rem] lg:max-w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  aria-label="Buscar en el catálogo"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  placeholder="Buscar en el catálogo"
                  className="pl-9"
                />
              </div>
              {hasProducts && (!showTabs || filter !== "services") && (
                <Select
                  value={searching ? "all" : stockFilter}
                  onValueChange={(value) => { setStockFilter(value as StockFilter); setPage(1); }}
                  disabled={searching}
                >
                  <SelectTrigger aria-label="Filtrar por existencias" className="shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Disponibles</SelectItem>
                    <SelectItem value="out">Sin existencias</SelectItem>
                    <SelectItem value="all">Todas las existencias</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {hasProducts && (
                <p role="status" className="flex w-full items-center gap-1.5 text-xs text-muted-foreground lg:ml-auto lg:w-auto">
                  <span aria-hidden="true" className={status === "live" ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-muted-foreground/50"} />
                  {STOCK_LABEL[status]}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {published.length === 0 ? (
        <div className={resultsClassName}>
          <div className="rounded-2xl border border-dashed px-4 py-20 text-center">
            <Store className="mx-auto mb-3 size-10 text-muted-foreground/40" aria-hidden="true" />
            <h2 className="font-semibold">{status === "unavailable" ? "Catálogo no disponible" : "Catálogo en preparación"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === "unavailable"
                ? "Solicita al negocio su enlace actualizado."
                : "Este negocio todavía no ha publicado productos o servicios."}
            </p>
          </div>
        </div>
      ) : showTabs ? (
        <TabsContent value={filter} className={resultsClassName}>{results}</TabsContent>
      ) : (
        <div className={resultsClassName}>{results}</div>
      )}
    </Tabs>
  );
}
