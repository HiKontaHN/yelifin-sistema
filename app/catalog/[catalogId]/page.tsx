import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";

import { PublicCatalogBrowser } from "@/components/catalog/public-catalog-browser";
import { HiKontaIcon } from "@/components/shared/hikonta-icon";
import { HiKontaTitle } from "@/components/shared/hikonta-title";
import { getPublicCatalog } from "@/lib/public-catalog";

type Props = { params: Promise<{ catalogId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { catalogId } = await params;
  const catalog = await getPublicCatalog(catalogId);
  if (!catalog) return { title: "Catálogo no encontrado | HiKonta" };
  return {
    title: `Catálogo de ${catalog.organization.name}`,
    description: `Consulta los productos y servicios de ${catalog.organization.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function CatalogPage({ params }: Props) {
  const { catalogId } = await params;
  const catalog = await getPublicCatalog(catalogId);
  if (!catalog) notFound();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main className="flex-1">
        <PublicCatalogBrowser
          key={catalogId}
          catalogId={catalogId}
          catalog={catalog}
          realtime={process.env.VERCEL === "1"}
          header={(
            <>
              <CatalogBrand compactOnMobile />
              <div className="flex min-w-0 flex-1 items-center gap-2.5 border-l pl-3 sm:pl-5">
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">
                  {catalog.organization.logo_url ? (
                    <Image src={catalog.organization.logo_url} alt="" width={40} height={40} className="size-full object-contain" unoptimized />
                  ) : (
                    <Store className="size-5 text-primary" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Catálogo</p>
                  <h1 className="truncate text-lg font-bold sm:text-xl" title={catalog.organization.name}>
                    {catalog.organization.name}
                  </h1>
                </div>
              </div>
            </>
          )}
        />
      </main>
      <footer className="flex items-center justify-center gap-2 border-t py-6 text-xs text-muted-foreground">
        <span>Catálogo creado con</span>
        <CatalogBrand />
      </footer>
    </div>
  );
}

function CatalogBrand({ compactOnMobile = false }: { compactOnMobile?: boolean }) {
  return (
    <Link href="/" aria-label="Ir a HiKonta" className="shrink-0 rounded-md">
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <HiKontaIcon className="size-8" />
        <HiKontaTitle className={compactOnMobile ? "hidden h-5 sm:inline-block" : "h-5"} />
      </span>
    </Link>
  );
}
