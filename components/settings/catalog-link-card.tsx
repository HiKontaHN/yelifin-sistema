"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness, Check, Copy, ExternalLink, Loader2, Package,
  Pencil, RefreshCw, Search, Store,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CatalogProduct = {
  id: number;
  name: string;
  description: string | null;
  sku: string | null;
  is_service: boolean;
  selected: boolean;
};

type CatalogState = {
  catalog_id: string | null;
  catalog_path: string | null;
  products: CatalogProduct[];
};

export function CatalogLinkCard() {
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [regenerateLink, setRegenerateLink] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/organization/catalog")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el catálogo");
        setCatalog(body.data);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setIsLoading(false));
  }, []);

  const catalogUrl = catalog?.catalog_path && origin
    ? `${origin}${catalog.catalog_path}`
    : "";

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return catalog?.products ?? [];
    return (catalog?.products ?? []).filter((product) =>
      product.name.toLocaleLowerCase("es").includes(query)
      || product.description?.toLocaleLowerCase("es").includes(query)
      || product.sku?.toLocaleLowerCase("es").includes(query),
    );
  }, [catalog?.products, search]);

  const openSelector = (regenerate: boolean) => {
    if (!catalog) return;
    const defaults = catalog.catalog_id
      ? catalog.products.filter((product) => product.selected).map((product) => product.id)
      : catalog.products.map((product) => product.id);
    setSelectedIds(new Set(defaults));
    setSearch("");
    setRegenerateLink(regenerate);
    setSelectorOpen(true);
  };

  const toggleProduct = (id: number, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const product of visibleProducts) {
        if (checked) next.add(product.id);
        else next.delete(product.id);
      }
      return next;
    });
  };

  const saveCatalog = async () => {
    if (!catalog) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/organization/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: regenerateLink, product_ids: [...selectedIds] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el catálogo");
      setCatalog({
        ...catalog,
        ...body.data,
        products: catalog.products.map((product) => ({
          ...product,
          selected: selectedIds.has(product.id),
        })),
      });
      setSelectorOpen(false);
      toast.success(regenerateLink ? "Catálogo y enlace actualizados" : "Catálogo guardado correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el catálogo");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = async () => {
    if (!catalogUrl) return;
    try {
      await navigator.clipboard.writeText(catalogUrl);
      setCopied(true);
      toast.success("Enlace copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="size-4 text-muted-foreground" /> Catálogo público
          </CardTitle>
          <CardDescription>
            Elige qué productos y servicios mostrar y compártelos mediante un enlace público seguro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 md:space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando catálogo…
            </div>
          ) : catalog?.catalog_path ? (
            <>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input value={catalogUrl} readOnly aria-label="Enlace del catálogo" className="font-mono text-xs" />
                <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
                  <Button type="button" variant="outline" onClick={copyLink} className="gap-2 max-md:h-11 max-md:px-2">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <Button type="button" variant="outline" asChild className="gap-2 max-md:h-11 max-md:px-2">
                    <a href={catalog.catalog_path} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" /> Ver catálogo
                    </a>
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => openSelector(false)} className="gap-2 max-md:h-auto max-md:min-h-11 max-md:whitespace-normal max-md:px-2">
                  <Pencil className="size-4" />
                  <span className="md:hidden">Editar contenido</span>
                  <span className="hidden md:inline">Editar productos y servicios</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => openSelector(true)} className="gap-2 text-muted-foreground max-md:h-auto max-md:min-h-11 max-md:whitespace-normal max-md:border max-md:px-2">
                  <RefreshCw className="size-4" />
                  <span className="md:hidden">Nuevo enlace</span>
                  <span className="hidden md:inline">Generar enlace nuevo</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {catalog.products.filter((product) => product.selected).length} de {catalog.products.length} elementos visibles.
              </p>
            </>
          ) : (
            <div className="flex justify-end md:justify-start">
              <Button type="button" onClick={() => openSelector(false)} disabled={!catalog} className="gap-2">
                <Store className="size-4" /> Generar catálogo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectorOpen} onOpenChange={(open) => !isGenerating && setSelectorOpen(open)}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecciona el contenido del catálogo</DialogTitle>
            <DialogDescription>
              Marca los productos y servicios que tus clientes podrán ver. Los costos y el inventario nunca se publican.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, descripción o SKU" className="pl-9" />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{selectedIds.size} seleccionados</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAllVisible(true)}>Seleccionar visibles</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAllVisible(false)}>Quitar visibles</Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border p-2">
            {visibleProducts.length ? visibleProducts.map((product) => {
              const inputId = `catalog-product-${product.id}`;
              return (
                <Label key={product.id} htmlFor={inputId} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/60">
                  <Checkbox
                    id={inputId}
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={(checked) => toggleProduct(product.id, checked === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {product.is_service ? <BriefcaseBusiness className="size-4 text-muted-foreground" /> : <Package className="size-4 text-muted-foreground" />}
                      {product.name}
                    </span>
                    {(product.sku || product.description) && (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {[product.sku, product.description].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{product.is_service ? "Servicio" : "Producto"}</span>
                </Label>
              );
            }) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No se encontraron coincidencias.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectorOpen(false)} disabled={isGenerating}>Cancelar</Button>
            <Button type="button" onClick={saveCatalog} disabled={isGenerating} className="gap-2">
              {isGenerating && <Loader2 className="size-4 animate-spin" />}
              {catalog?.catalog_id ? "Guardar catálogo" : "Generar catálogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
