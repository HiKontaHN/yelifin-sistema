// components/sales/pos/edit/edit-sale-options-panel.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
    User,
    CreditCard,
    Truck,
    MessageSquare,
    Clock,
} from "lucide-react";
import { useCurrency } from "@/hooks/swr/use-currency";

export type EditSaleOptionsPanelProps = {
    customers: any[];
    accounts: any[];
    hasSupplies: boolean;
    customerId: number | null;
    accountId: number | null;
    notes: string;
    grandTotal: number;
    shippingCost: number;
    isCreating: boolean;
    isPending: boolean;
    canPartialPayment: boolean;
    isPartialPayment: boolean;
    amountPaid: number;
    onCustomerChange: (id: number | null) => void;
    onAccountChange: (id: number | null) => void;
    onNotesChange: (val: string) => void;
    onShippingCostChange: (val: number) => void;
    onIsPendingChange: (val: boolean) => void;
    onPartialPaymentChange: (val: boolean) => void;
    onAmountPaidChange: (val: number) => void;
    onOpenSupplies: () => void;
    onSavePending: () => void;
    onCompleteRequest: () => void;
    onCancelRequest: () => void;
    onBack?: () => void;
};

export function EditSaleOptionsPanel({
    customers,
    accounts,
    hasSupplies,
    customerId,
    accountId,
    notes,
    grandTotal,
    shippingCost,
    isCreating,
    isPending,
    canPartialPayment,
    isPartialPayment,
    amountPaid,
    onCustomerChange,
    onAccountChange,
    onNotesChange,
    onShippingCostChange,
    onPartialPaymentChange,
    onAmountPaidChange,
    onOpenSupplies,
    onSavePending,
    onCompleteRequest,
    onCancelRequest,
    onBack,
}: EditSaleOptionsPanelProps) {
    const { format } = useCurrency();

    return (
        <Card className="shadow-sm border border-border/70">
            <CardContent className="pt-4 pb-4 space-y-4 text-sm">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>Opciones y pago</span>
                    </div>
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                            ← Carrito
                        </button>
                    )}
                </div>

                {/* Cliente: siempre 100% ancho */}
                <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                        <User className="size-3.5 text-muted-foreground" />
                        <span>Cliente</span>
                        <span className="text-[11px] text-muted-foreground">
                            (opcional)
                        </span>
                    </Label>
                    <Select
                        value={customerId ? String(customerId) : "none"}
                        onValueChange={(val) =>
                            onCustomerChange(val === "none" ? null : Number(val))
                        }
                    >
                        <SelectTrigger className="h-9 text-xs w-full">
                            <SelectValue placeholder="Venta anónima" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Venta anónima</SelectItem>
                            {customers.map((c: any) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {isPending && canPartialPayment && customerId && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                            <Checkbox checked={isPartialPayment} onCheckedChange={(checked) => onPartialPaymentChange(checked === true)} />
                            Cobro parcial al completar
                        </label>
                        {isPartialPayment && (
                            <div className="space-y-1.5">
                                <Label className="text-[11px]">Pagado ahora</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max={grandTotal}
                                    step="0.01"
                                    value={amountPaid === 0 ? "" : amountPaid}
                                    onChange={(e) => onAmountPaidChange(Math.max(0, Number(e.target.value) || 0))}
                                    placeholder="0"
                                    className="h-8 text-sm"
                                />
                                <p className="text-[11px] text-muted-foreground">Saldo pendiente: <strong>{format(Math.max(0, grandTotal - amountPaid))}</strong></p>
                            </div>
                        )}
                    </div>
                )}

                {/* Cuenta + Envío */}
                <div className="flex flex-col gap-3 md:flex-row">
                    {/* Cuenta de destino: 50% en desktop, 100% en móvil */}
                    <div className="flex-1 space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                            <CreditCard className="size-3.5 text-muted-foreground" />
                            <span>Cuenta de destino</span>
                            <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            value={accountId ? String(accountId) : ""}
                            onValueChange={(val) =>
                                onAccountChange(val ? Number(val) : null)
                            }
                        >
                            <SelectTrigger className="h-9 text-xs w-full">
                                <SelectValue placeholder="Seleccionar cuenta..." />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map((a: any) => (
                                    <SelectItem key={a.id} value={String(a.id)}>
                                        {a.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Costo de envío */}
                    <div className="flex-1 space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                            <Truck className="size-3.5 text-muted-foreground" />
                            <span>Costo de envío</span>
                            <span className="text-[11px] text-muted-foreground">
                                (opcional)
                            </span>
                        </Label>

                        <div className="relative">
                            {/* Prefijo moneda */}
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                L
                            </span>

                            <Input
                                type="number"
                                value={shippingCost === 0 ? "0" : shippingCost}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/^0+(\d)/, "$1");
                                    const n = parseFloat(raw);
                                    onShippingCostChange(isNaN(n) ? 0 : Math.max(0, n));
                                }}
                                className="h-9 text-xs pl-7"
                                min="0"
                                step="0.01"
                                placeholder="0"
                            />
                        </div>
                    </div>
                </div>

                {/* Notas */}
                <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                        <MessageSquare className="size-3.5 text-muted-foreground" />
                        <span>Notas</span>
                        <span className="text-[11px] text-muted-foreground">
                            (opcional)
                        </span>
                    </Label>
                    <Textarea
                        value={notes}
                        onChange={(e) => onNotesChange(e.target.value)}
                        rows={3}
                        className="text-xs resize-none"
                        placeholder="Observaciones..."
                    />
                </div>

                {/* Suministros usados */}
                {hasSupplies && (
                    <button
                        type="button"
                        onClick={onOpenSupplies}
                        className="text-xs text-primary underline-offset-2 hover:underline cursor-pointer"
                    >
                        Administrar suministros usados
                    </button>
                )}

                {/* Registrar como pendiente */}
                <div className="mt-1 rounded-xl border bg-muted/50 px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <div className="mt-0.5">
                            <Clock className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-xs font-medium">
                                Registrar como pendiente
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                El pago se registra al confirmar
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={isPending}
                        disabled
                    />
                </div>

                {/* Total editado */}
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                        Total editado
                    </span>
                    <span className="text-base font-semibold">
                        {format(grandTotal)}
                    </span>
                </div>

                {/* Acciones */}
                <div className="space-y-2 pt-1.5">
                    <Button
                        type="button"
                        className="w-full"
                        size="sm"
                        disabled={isCreating}
                        onClick={onSavePending}
                    >
                        {isPending ? "Guardar cambios (pendiente)" : "Guardar cambios"}
                    </Button>

                    {isPending && (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                size="sm"
                                disabled={isCreating}
                                onClick={onCompleteRequest}
                            >
                                Completar venta
                            </Button>

                            <button
                                type="button"
                                className="w-full text-xs text-destructive hover:underline cursor-pointer text-center"
                                onClick={onCancelRequest}
                            >
                                Cancelar venta
                            </button>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
