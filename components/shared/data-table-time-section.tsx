"use client";

import { Fragment, useId, useMemo, useRef, type CSSProperties, type Key, type ReactNode, type UIEvent } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const DATA_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_DATA_TABLE_PAGE_SIZE = 10;

export interface DataTableTimeSectionColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Shared by the independent header and every section's table. */
  width?: CSSProperties["width"];
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
  /** Use for action columns whose clicks should not open the row. */
  stopRowClick?: boolean;
}

export interface DataTableTimeSectionPagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}

export interface DataTableTimeSectionProps<T> {
  columns: readonly DataTableTimeSectionColumn<T>[];
  /** Pass the current page of records; the component does not paginate again. */
  data: readonly T[];
  getRowKey: (row: T) => Key;
  /** Omit to render one continuous table. Group order follows the supplied data. */
  getGroupKey?: (row: T) => string;
  renderGroupHeader?: (key: string, rows: readonly T[]) => ReactNode;
  pagination?: DataTableTimeSectionPagination;
  recordLabel?: string;
  isLoading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Optional subordinate table rows rendered immediately after each row. */
  renderExpandedRows?: (row: T) => ReactNode;
  rowClassName?: string | ((row: T) => string | undefined);
  stickyHeader?: boolean;
  /** CSS offset relative to the page's scroll container, including its padding. */
  stickyOffset?: CSSProperties["top"];
  minWidth?: CSSProperties["minWidth"];
  /** Optional card presentation below lg; the renderer owns card interactions. */
  renderMobileRow?: (row: T) => ReactNode;
  className?: string;
  ariaLabel?: string;
  showFooterPagination?: boolean;
  hideFooterPaginationOnDesktop?: boolean;
}

const alignment = { left: "text-left", center: "text-center", right: "text-right" };

function PageNavigation({
  pagination,
  isLoading,
  numbered = false,
}: {
  pagination: DataTableTimeSectionPagination;
  isLoading: boolean;
  numbered?: boolean;
}) {
  const { page, pageSize, total, onPageChange } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  return (
    <nav aria-label={numbered ? "Paginación inferior" : "Paginación superior"} className="flex shrink-0 items-center gap-1">
      <Button
        type="button" variant="ghost" size="icon-sm" aria-label="Página anterior" title="Página anterior"
        disabled={isLoading || page <= 1} onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      {isLoading ? (
        <Skeleton className="h-4 w-24" />
      ) : numbered && totalPages > 1 ? (
        pages.map((value, index) => (
          <Fragment key={value}>
            {index > 0 && value - pages[index - 1] > 1 && (
              <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Button
              type="button" variant={value === page ? "outline" : "ghost"} size="icon-sm"
              aria-label={`Ir a la página ${value}`} aria-current={value === page ? "page" : undefined}
              onClick={() => onPageChange(value)}
            >
              {value}
            </Button>
          </Fragment>
        ))
      ) : (
        <span className="whitespace-nowrap px-1 text-xs text-muted-foreground sm:text-sm" aria-live="polite">
          Página {page} de {totalPages}
        </span>
      )}
      <Button
        type="button" variant="ghost" size="icon-sm" aria-label="Página siguiente" title="Página siguiente"
        disabled={isLoading || page >= totalPages} onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

/**
 * Independent sticky controls/column header with configurable grouped tables.
 * Fetching, filtering, sorting, permissions and date/timezone rules stay with the caller.
 */
export function DataTableTimeSection<T>({
  columns, data, getRowKey, getGroupKey, renderGroupHeader, pagination,
  recordLabel = "registros", isLoading = false, emptyState = "No hay registros para mostrar",
  onRowClick, renderExpandedRows, rowClassName, stickyHeader = true, stickyOffset = 0, minWidth,
  renderMobileRow, className, ariaLabel = "Datos", showFooterPagination = true,
  hideFooterPaginationOnDesktop = false,
}: DataTableTimeSectionProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const pageSizeId = useId();
  const groups = useMemo(() => {
    const grouped = new Map<string, T[]>();
    for (const row of data) {
      const key = getGroupKey?.(row) ?? "";
      const rows = grouped.get(key);
      if (rows) rows.push(row);
      else grouped.set(key, [row]);
    }
    return Array.from(grouped, ([key, rows]) => ({ key, rows }));
  }, [data, getGroupKey]);

  const total = pagination?.total ?? data.length;
  const start = data.length && pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const end = Math.min(total, start + data.length - 1);
  const tableStyle: CSSProperties = { minWidth };
  const desktopClassName = renderMobileRow ? "hidden lg:block" : undefined;

  const syncHorizontalScroll = (event: UIEvent<HTMLDivElement>) => {
    const source = event.currentTarget;
    const target = source === headerScrollRef.current ? bodyScrollRef.current : headerScrollRef.current;
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };

  const changePage = (page: number) => {
    pagination?.onPageChange(page);
    rootRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  };
  const navigation = pagination ? { ...pagination, onPageChange: changePage } : undefined;

  const columnWidths = () => (
    <colgroup>
      {columns.map((column) => <col key={column.id} style={{ width: column.width }} />)}
    </colgroup>
  );

  const columnHeaders = () => (
    <TableRow className="hover:bg-transparent">
      {columns.map((column) => (
        <TableHead key={column.id} scope="col" className={cn("px-3", alignment[column.align ?? "left"], column.headerClassName)}>
          {column.header}
        </TableHead>
      ))}
    </TableRow>
  );

  const groupHeading = (key: string, rows: readonly T[]) => (
    <div className="flex min-h-9 items-center border-y border-border/70 bg-accent px-3 text-left text-xs font-medium text-muted-foreground sm:px-4 sm:text-sm">
      <span>{renderGroupHeader ? renderGroupHeader(key, rows) : key}</span>
    </div>
  );

  return (
    <div ref={rootRef} data-slot="data-table-time-section" className={cn("space-y-0", className)} aria-busy={isLoading}>
      <div
        data-slot="data-table-sticky-header"
        className={cn("z-10 bg-background", stickyHeader && "sticky")}
        style={stickyHeader ? { top: stickyOffset } : undefined}
      >
        <div className="rounded-t-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3 sm:px-4">
            {isLoading ? <Skeleton className="h-4 w-24" /> : (
              <p className="text-sm text-muted-foreground" aria-live="polite">{total} {recordLabel}</p>
            )}
            {pagination && navigation && (
              <div className="flex w-full items-center justify-between gap-10 sm:w-auto">
                <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  <Select
                    value={String(pagination.pageSize)} disabled={isLoading}
                    onValueChange={(value) => {
                      changePage(1);
                      pagination.onPageSizeChange(Number(value));
                    }}
                  >
                    <SelectTrigger id={pageSizeId} size="sm" className="w-20" aria-label="Registros por página">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(pagination.pageSizeOptions ?? DATA_TABLE_PAGE_SIZE_OPTIONS).map((size) => (
                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="hidden sm:inline">por página</span>
                </div>
                <PageNavigation pagination={navigation} isLoading={isLoading} />
              </div>
            )}
          </div>
          <div className={desktopClassName}>
            <div
              ref={headerScrollRef} onScroll={syncHorizontalScroll}
              className="overflow-x-auto border-t [scrollbar-width:thin]"
            >
              <table className="w-full table-fixed text-sm" style={tableStyle} aria-hidden="true">
                {columnWidths()}
                <TableHeader className="[&_tr]:border-0">{columnHeaders()}</TableHeader>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div ref={bodyScrollRef} onScroll={syncHorizontalScroll} className={cn("overflow-x-auto [scrollbar-width:thin]", desktopClassName)}>
        <div style={tableStyle}>
          {isLoading ? (
            <div className="rounded-b-xl border border-t-0 bg-card">
              <table className="w-full table-fixed text-sm" style={tableStyle} aria-label={ariaLabel}>
                {columnWidths()}
                <TableBody>
                  {Array.from({ length: 5 }, (_, index) => (
                    <TableRow key={index}>
                      {columns.map((column) => <TableCell key={column.id} className="px-3 py-3"><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          ) : data.length === 0 ? (
            <div className="rounded-b-xl border border-t-0 bg-card px-4 py-12 text-center text-sm text-muted-foreground">{emptyState}</div>
          ) : (
            <div className="overflow-hidden rounded-b-xl border border-t-0 bg-card">
              <table className="w-full table-fixed text-sm" style={tableStyle} aria-label={ariaLabel}>
                {columnWidths()}
                <TableHeader className="sr-only">{columnHeaders()}</TableHeader>
                {groups.map((group) => (
                  <TableBody key={group.key}>
                    {getGroupKey && (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell
                          colSpan={columns.length}
                          className="border-y border-border/70 bg-accent px-3 py-2 text-left font-medium text-muted-foreground sm:px-4"
                        >
                          {renderGroupHeader ? renderGroupHeader(group.key, group.rows) : group.key}
                        </TableCell>
                      </TableRow>
                    )}
                    {group.rows.map((row) => (
                      <Fragment key={getRowKey(row)}>
                        <TableRow
                          className={cn(onRowClick && "cursor-pointer focus-visible:outline-2 focus-visible:outline-ring", typeof rowClassName === "function" ? rowClassName(row) : rowClassName)}
                          tabIndex={onRowClick ? 0 : undefined}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                          onKeyDown={onRowClick ? (event) => {
                            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault();
                              onRowClick(row);
                            }
                          } : undefined}
                        >
                          {columns.map((column) => (
                            <TableCell
                              key={column.id} className={cn("px-3", alignment[column.align ?? "left"], column.className)}
                              onClick={column.stopRowClick ? (event) => event.stopPropagation() : undefined}
                            >
                              {column.cell(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                        {renderExpandedRows?.(row)}
                      </Fragment>
                    ))}
                  </TableBody>
                ))}
              </table>
            </div>
          )}
        </div>
      </div>

      {renderMobileRow && (
        <div className="lg:hidden">
          {isLoading ? (
            <div className="space-y-2 pt-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full rounded-xl" />)}</div>
          ) : data.length === 0 ? (
            <div className="rounded-b-xl border border-t-0 bg-card px-4 py-12 text-center text-sm text-muted-foreground">{emptyState}</div>
          ) : groups.map((group) => (
            <section key={group.key}>
              {getGroupKey && groupHeading(group.key, group.rows)}
              <div className="space-y-2">{group.rows.map((row) => <Fragment key={getRowKey(row)}>{renderMobileRow(row)}</Fragment>)}</div>
            </section>
          ))}
        </div>
      )}

      {navigation && showFooterPagination && (
        <div className={cn("flex flex-col items-center justify-between gap-2 pt-4 sm:flex-row", hideFooterPaginationOnDesktop && "lg:hidden")}>
          {isLoading ? <Skeleton className="h-4 w-44" /> : (
            <p className="text-xs text-muted-foreground sm:text-sm">Mostrando {start}–{data.length ? end : 0} de {total} {recordLabel}</p>
          )}
          <PageNavigation pagination={navigation} isLoading={isLoading} numbered />
        </div>
      )}
    </div>
  );
}
