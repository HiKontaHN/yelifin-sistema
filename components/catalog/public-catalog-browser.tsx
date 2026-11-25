"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, Store } from "lucide-react";

import { CatalogCartSheet } from "@/components/catalog/catalog-cart-sheet";
import { CatalogItemCard } from "@/components/catalog/catalog-item-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCatalogStock } from "@/hooks/use-catalog-stock";
import { buildCatalogCartLines, changeCatalogQuantity, readCatalogCart, type CatalogCart } from "@/lib/catalog-cart";
import { getCatalogItemAvailability } from "@/lib/catalog-stock";
import type { PublicCatalog } from "@/lib/public-catalog";

type Filter = "all" | "products" | "services";
const PAGE_SIZE = 15;
const CATALOG_CONTAINER = "mx-auto w-full max-w-7xl sm:px-6 lg:px-8 xl:w-4/5 xl:max-w-none";

export function PublicCatalogBrowser({ catalogId, catalog, header, initialPage, realtime }: {
  catalogId: string;
  catalog: PublicCatalog;
  header: ReactNode;
  initialPage: number;
  realtime: boolean;
}) {
  const { items, organization, contacts } = catalog;
  const { stock, status } = useCatalogStock(catalogId, catalog.stock, realtime, items.length > 0);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialPage);
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
  const searching = Boolean(search.trim());
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(organization.locale);
    return published.filter((item) => {
      if (showTabs && filter === "products" && item.is_service) return false;
      if (showTabs && filter === "services" && !item.is_service) return false;
      const available = getCatalogItemAvailability(item, stock);
      if (available !== null && (available ?? 0) <= 0) return false;
      if (query) {
        return item.name.toLocaleLowerCase(organization.locale).includes(query)
          || item.description?.toLocaleLowerCase(organization.locale).includes(query);
      }
      return true;
    });
  }, [filter, organization.locale, published, search, showTabs, stock]);

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstPageNumber = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const pageNumbers = Array.from(
    { length: Math.min(5, pageCount) },
    (_, index) => firstPageNumber + index,
  );
  const lastPageNumber = pageNumbers[pageNumbers.length - 1];
  const from = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visibleItems.slice(from, from + PAGE_SIZE);
  const resultsClassName = `${CATALOG_CONTAINER} px-3 py-4 sm:py-6`;

  function selectPage(nextPage: number) {
    setPage(nextPage);
    const url = new URL(window.location.href);
    if (nextPage === 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(nextPage));
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }

  function goToPage(nextPage: number) {
    selectPage(nextPage);
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
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
        {pageItems.map((item) => <CatalogItemCard key={item.id} item={item} formatter={formatter} stock={stock} cart={cart} add={add} />)}
      </div>
      {pageCount > 1 && (
        <nav aria-label="Páginas del catálogo" className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-1">
            {firstPageNumber > 1 && (
              <>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Página 1" onClick={() => goToPage(1)}>1</Button>
                {firstPageNumber > 2 && <span aria-hidden="true">…</span>}
              </>
            )}
            {pageNumbers.map((number) => (
              <Button
                key={number}
                type="button"
                variant={number === currentPage ? "default" : "outline"}
                size="icon-sm"
                aria-label={`Página ${number}`}
                aria-current={number === currentPage ? "page" : undefined}
                onClick={() => goToPage(number)}
              >
                {number}
              </Button>
            ))}
            {lastPageNumber < pageCount && (
              <>
                {lastPageNumber < pageCount - 1 && <span aria-hidden="true">…</span>}
                <Button type="button" variant="outline" size="icon-sm" aria-label={`Página ${pageCount}`} onClick={() => goToPage(pageCount)}>
                  {pageCount}
                </Button>
              </>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => goToPage(currentPage + 1)}>
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </nav>
      )}
    </>
  ) : (
    <div className="rounded-2xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
      {searching ? "No encontramos productos o servicios con esa búsqueda." : "No hay artículos disponibles."}
    </div>
  );

  return (
    <Tabs value={filter} onValueChange={(value) => { setFilter(value as Filter); selectPage(1); }} className="gap-0">
      <div className="sticky top-0 z-30 bg-background">
        <header className="border-b bg-card">
          <nav aria-label="Barra del catálogo" className={`${CATALOG_CONTAINER} flex min-h-16 items-center gap-2 px-4 py-2 sm:gap-4`}>
            {header}
            {(published.length > 0 || lines.length > 0) && (
              <CatalogCartSheet contacts={contacts} lines={lines} formatter={formatter} setQuantity={setQuantity} />
            )}
            <ThemeToggle isCollapsed />
          </nav>
        </header>
        {published.length > 0 && (
          <div className="border-b">
            <div className={`${CATALOG_CONTAINER} flex flex-wrap items-center gap-2 px-4 py-2 sm:gap-3`}>
              {showTabs && (
                <TabsList aria-label="Filtrar catálogo" className="grid w-full grid-cols-3 border-0 sm:w-auto">
                  <TabsTrigger value="all" className="py-2">Todo</TabsTrigger>
                  <TabsTrigger value="products" className="py-2">Productos</TabsTrigger>
                  <TabsTrigger value="services" className="py-2">Servicios</TabsTrigger>
                </TabsList>
              )}
              <div className="relative w-full min-w-0 sm:ml-auto sm:w-80 sm:max-w-full lg:w-[28rem]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  aria-label="Buscar en el catálogo"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); selectPage(1); }}
                  placeholder="Buscar en el catálogo"
                  className="pl-9"
                />
              </div>
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
