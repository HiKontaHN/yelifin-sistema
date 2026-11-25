"use client";

import { useState } from "react";
import { CircleCheck, Copy, Info, Instagram, MessageCircle, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCatalogMessage, canShareCatalogCart, getInstagramCatalogChat, getWhatsAppCatalogShare, INSTAGRAM_WEB_INBOX,
  type CatalogCartLine,
} from "@/lib/catalog-cart";
import type { PublicCatalog } from "@/lib/public-catalog";

type CopyChannel = "instagram" | "whatsapp" | "list";

export function CatalogCartSheet({ contacts, lines, formatter, setQuantity }: {
  contacts: PublicCatalog["contacts"];
  lines: CatalogCartLine[];
  formatter: Intl.NumberFormat;
  setQuantity: (id: string, quantity: number) => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState<{ copied: boolean; channel: CopyChannel } | null>(null);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const shareable = canShareCatalogCart(lines);
  const message = buildCatalogMessage(lines);
  const whatsapp = getWhatsAppCatalogShare(contacts.whatsapp, message);
  const instagram = getInstagramCatalogChat(contacts.instagram);

  const copy = async (channel: CopyChannel) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyFeedback({ copied: true, channel });
    } catch {
      setCopyFeedback({ copied: false, channel });
    }
  };

  const updateQuantity = (id: string, quantity: number) => {
    setCopyFeedback(null);
    setQuantity(id, quantity);
  };

  const pasteInChat = copyFeedback?.channel === "whatsapp"
    ? "Pega el mensaje manualmente en el chat de WhatsApp."
    : instagram
      ? "En Instagram, pega el mensaje manualmente en la conversación."
      : "Pega la lista en la conversación que elijas.";

  return (
    <Sheet onOpenChange={(opened) => { if (opened) setCopyFeedback(null); }}>
      <SheetTrigger asChild>
        <Button type="button" size="icon" variant="outline" className="relative" aria-label={`Abrir carrito (${count})`}>
          <ShoppingCart className="size-4" aria-hidden="true" />
          {count > 0 && (
            <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-semibold leading-5 text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>Carrito de consulta</SheetTitle>
          <SheetDescription>Comparte tu selección y confirma la disponibilidad por chat.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {lines.length > 0 ? (
            <ul className="divide-y">
              {lines.map((line) => {
                const label = line.variantName ? `${line.name} · ${line.variantName}` : line.name;
                const { available, quantity } = line;
                const needsAdjustment = available !== null && (available === undefined || available < quantity);
                return (
                  <li key={line.id} className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{formatter.format(line.price)} c/u</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${label}`} onClick={() => updateQuantity(line.id, 0)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="icon-sm" variant="outline" aria-label={`Restar una unidad de ${label}`} onClick={() => updateQuantity(line.id, quantity - 1)}>
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-6 text-center text-sm tabular-nums">{quantity}</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={`Sumar una unidad de ${label}`}
                        disabled={available === undefined || (available !== null && quantity >= available)}
                        onClick={() => updateQuantity(line.id, quantity + 1)}
                      >
                        <Plus className="size-4" />
                      </Button>
                      {needsAdjustment && available !== undefined && available > 0 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => updateQuantity(line.id, available)}>
                          Ajustar a {available}
                        </Button>
                      )}
                    </div>
                    {needsAdjustment && (
                      <p role="status" className="text-sm text-destructive">
                        {available ? `Disponibilidad actual: ${available}.` : "Ya no hay unidades disponibles."}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Agrega productos o servicios del catálogo para armar tu consulta.</p>
          )}
        </div>
        {lines.length > 0 && (
          <SheetFooter className="shrink-0 gap-2 border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatter.format(total)}</span>
            </div>
            {shareable ? (
              <>
                {(whatsapp || instagram) && (
                  <div className="flex gap-2">
                    {whatsapp && (
                      <Button asChild className="flex-1">
                        <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" onClick={() => {
                          if (whatsapp.copy) void copy("whatsapp");
                        }}>
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                      </Button>
                    )}
                    {instagram && (
                      <Button asChild variant="outline" className="flex-1">
                        <a
                          href={instagram.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Copiar lista y abrir Instagram"
                          onClick={() => void copy("instagram")}
                        >
                          <Instagram className="size-4" /> Instagram
                        </a>
                      </Button>
                    )}
                  </div>
                )}
                <Button type="button" variant="ghost" onClick={() => void copy("list")}>
                  <Copy className="size-4" /> Copiar lista
                </Button>
                {(instagram || copyFeedback) && (
                  <Alert
                    role={copyFeedback ? "status" : "note"}
                    className={copyFeedback?.copied ? "border-success/30 bg-success/10" : "border-primary/20 bg-primary/5"}
                  >
                    {copyFeedback?.copied ? <CircleCheck className="text-success" /> : <Info className="text-primary" />}
                    <AlertTitle>
                      {copyFeedback ? (copyFeedback.copied ? "Lista copiada" : "Copia el mensaje") : "Compartir por Instagram"}
                    </AlertTitle>
                    <AlertDescription>
                      {copyFeedback?.copied === false && <p>Selecciona y copia el texto de abajo.</p>}
                      <p>{pasteInChat}</p>
                      {instagram?.handle && copyFeedback?.channel !== "whatsapp" && (
                        <p>
                          En el navegador, busca @{instagram.handle} en{" "}
                          <a href={INSTAGRAM_WEB_INBOX} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
                            Instagram Web
                          </a>.
                        </p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                {copyFeedback?.copied === false && (
                  <Textarea
                    readOnly
                    aria-label="Mensaje del carrito"
                    value={message}
                    onFocus={(event) => event.currentTarget.select()}
                    className="max-h-28 resize-none"
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Ajusta o quita los artículos sin disponibilidad para compartir la lista.</p>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
