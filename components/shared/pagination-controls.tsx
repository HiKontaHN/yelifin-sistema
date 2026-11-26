"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem,
} from "@/components/ui/pagination";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  label?: string;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  page, totalPages, total, label = "registros", onPageChange,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
    .reduce<(number | "…")[]>((acc, p, i, arr) => {
      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between mt-2">
      <p className="text-sm text-muted-foreground order-2 sm:order-1">
        {total} {label} · página {page} de {totalPages}
      </p>
      <Pagination aria-label="Paginación" className="order-1 sm:order-2 w-auto mx-0 justify-end">
        <PaginationContent className="flex-wrap justify-center">
          <PaginationItem>
            <Button type="button" variant="ghost" size="icon" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
          </PaginationItem>
          {pages.map((p, i) =>
            p === "…" ? (
              <PaginationItem key={`ellipsis-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <Button
                  type="button"
                  size="icon"
                  variant={p === page ? "outline" : "ghost"}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Página ${p}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </Button>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <Button type="button" variant="ghost" size="icon" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Página siguiente">
              <ChevronRight />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
