// components/settings/change-password-dialog.tsx
// Cambiar contraseña desde Mi Perfil > Seguridad. Reautentica con la
// contraseña actual (protege contra una sesión abierta ajena) y después
// llama a updatePassword — todo del lado de Firebase, sin endpoint propio.
// "¿Olvidaste tu contraseña?" reusa /api/auth/send-password-reset (el
// mismo del login).
"use client";

import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { PasswordRequirements } from "@/components/auth/password-requirements";
import { auth, authReady } from "@/lib/firebase";
import { meetsPasswordPolicy } from "@/lib/password-policy";
import { useAuth } from "@/hooks/use-auth";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    current: z.string().min(1, "Ingresa tu contraseña actual"),
    next: z.string().refine(meetsPasswordPolicy, "La contraseña no cumple los requisitos"),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  })
  .refine((d) => d.next !== d.current, {
    message: "La nueva contraseña no puede ser igual a la actual",
    path: ["next"],
  });

type FormData = z.infer<typeof schema>;

function PasswordField({
  id, label, error, disabled, autoComplete, ...field
}: {
  id: string;
  label: string;
  error?: string;
  disabled?: boolean;
  autoComplete: string;
} & UseFormRegisterReturn) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          disabled={disabled}
          className="h-11 pr-10 text-base"
          {...field}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { sessionUser } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const {
    register, handleSubmit, reset, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const nextValue = watch("next") ?? "";

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: FormData) => {
    const email = sessionUser?.email;
    if (!email) return toast.error("Tu sesión expiró, vuelve a iniciar sesión");

    try {
      await authReady;
      const credential = await signInWithEmailAndPassword(auth, email, data.current);
      await updatePassword(credential.user, data.next);
      await signOut(auth);
      toast.success("Contraseña actualizada");
      handleClose();
    } catch (err: any) {
      await signOut(auth).catch(() => undefined);
      if (err.code === "auth/too-many-requests") {
        return toast.error("Demasiados intentos. Intenta de nuevo en unos minutos.");
      }
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        return setError("current", { message: "La contraseña actual no es correcta" });
      }
      toast.error(
        err.code === "auth/weak-password"
          ? "La nueva contraseña es demasiado débil"
          : "No se pudo actualizar la contraseña",
      );
    }
  };

  const handleForgot = async () => {
    const email = sessionUser?.email;
    if (!email) return;
    setIsSending(true);
    try {
      const response = await fetch("/api/auth/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.data?.message !== "string") {
        toast.error(result?.error ?? "No se pudo enviar el correo de recuperación.");
        return;
      }
      toast.success(result.data.message);
    } catch {
      toast.error("No se pudo enviar el correo de recuperación.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Cambiar contraseña"
      icon={KeyRound}
      as="form"
      formProps={{ id: "change-password-form", onSubmit: handleSubmit(onSubmit) }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1 h-11">
            Cancelar
          </Button>
          <Button type="submit" form="change-password-form" disabled={isSubmitting} className="flex-1 h-11 gap-2">
            {isSubmitting
              ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
              : "Actualizar contraseña"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <PasswordField
          id="current-password"
          label="Contraseña actual"
          autoComplete="current-password"
          disabled={isSubmitting}
          error={errors.current?.message}
          {...register("current")}
        />
        <button
          type="button"
          onClick={handleForgot}
          disabled={isSending}
          className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
        >
          {isSending ? "Enviando…" : "¿Olvidaste tu contraseña?"}
        </button>
      </div>

      <PasswordField
        id="new-password"
        label="Nueva contraseña"
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.next?.message}
        {...register("next")}
      />
      <PasswordRequirements password={nextValue} className="-mt-2 sm:grid-cols-3" />

      <PasswordField
        id="confirm-password"
        label="Confirmar nueva contraseña"
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.confirm?.message}
        {...register("confirm")}
      />
    </ResponsiveModal>
  );
}
