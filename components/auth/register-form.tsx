// components/auth/register-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, authReady } from "@/lib/firebase";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Controller, useForm } from "react-hook-form";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const BIRTH_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
].map((label, index) => ({ value: String(index + 1), label }));
const BIRTH_DAYS = Array.from({ length: 31 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}));
const MAX_BIRTH_YEAR = new Date().getUTCFullYear() - 18;
const BIRTH_YEARS = Array.from({ length: 100 }, (_, index) => {
  const year = String(MAX_BIRTH_YEAR - index);
  return { value: year, label: year };
});

function dateOfBirthFromParts(month: string, day: string, year: string) {
  if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) {
    return null;
  }

  const normalizedMonth = month.padStart(2, "0");
  const normalizedDay = day.padStart(2, "0");
  const dateOfBirth = `${year}-${normalizedMonth}-${normalizedDay}`;
  const parsed = new Date(`${dateOfBirth}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dateOfBirth
  ) {
    return null;
  }

  return dateOfBirth;
}

const registerSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    email: z.string().email("Email inválido"),
    business_name: z
      .string()
      .min(2, "El nombre del negocio debe tener al menos 2 caracteres"),
    birth_month: z.string().regex(/^(0?[1-9]|1[0-2])$/, "Mes inválido"),
    birth_day: z.string().regex(/^(0?[1-9]|[12]\d|3[01])$/, "Día inválido"),
    birth_year: z.string().regex(/^\d{4}$/, "Año inválido"),
    password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine(
    (data) => dateOfBirthFromParts(data.birth_month, data.birth_day, data.birth_year) !== null,
    {
      message: "Fecha de nacimiento inválida",
      path: ["birth_day"],
    },
  )
  .refine(
    (data) => {
      const dateOfBirth = dateOfBirthFromParts(data.birth_month, data.birth_day, data.birth_year);
      if (!dateOfBirth) return false;

      const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
      const today = new Date();
      let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
      const birthdayPending =
        today.getUTCMonth() < birthDate.getUTCMonth() ||
        (today.getUTCMonth() === birthDate.getUTCMonth() &&
          today.getUTCDate() < birthDate.getUTCDate());
      if (birthdayPending) age -= 1;
      return age >= 18;
    },
    {
      message: "Debes tener al menos 18 años para crear una cuenta",
      path: ["birth_year"],
    },
  );

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm({ partnerCode }: { partnerCode?: string } = {}) {
  const { push } = useRouter();
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);

    try {
      const dateOfBirth = dateOfBirthFromParts(data.birth_month, data.birth_day, data.birth_year);
      if (!dateOfBirth) throw new Error("Fecha de nacimiento inválida");

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          display_name: data.name,
          business_name: data.business_name,
          date_of_birth: dateOfBirth,
          ...(partnerCode && { partner_code: partnerCode }),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Error al crear la cuenta");
      }

      await authReady;
      await signInWithEmailAndPassword(auth, data.email, data.password);
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No se pudo iniciar la sesión");

      const idToken = await currentUser.getIdToken();
      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!sessionResponse.ok) throw new Error("No se pudo iniciar la sesión");
      await signOut(auth);
      await mutate("/api/auth/me");

      // El servidor usa la cookie de sesión; el SDK ya no conserva al usuario.
      try {
        await fetch("/api/auth/send-verification-email", { method: "POST" });
      } catch (mailError) {
        console.error("No se pudo enviar el correo de verificación:", mailError);
      }

      toast.success(
        "¡Bienvenido a HiKonta! Revisa tu correo para verificar tu cuenta.",
        { duration: 5000 }
      );

      push("/verify-email");
    } catch (error: any) {
      await signOut(auth).catch(() => undefined);
      console.error("Error en registro:", error);

      let errorMessage = "Error al crear la cuenta";

      if (error.message === "Este correo ya está registrado") {
        errorMessage = "Este email ya está registrado";
      } else if (
        error.message === "La contraseña debe tener al menos 6 caracteres"
      ) {
        errorMessage = "La contraseña debe tener al menos 6 caracteres";
      } else if (error.message === "Error de configuración del sistema") {
        errorMessage = "Error del sistema. Por favor contacta a soporte.";
      } else if (error.code === "auth/invalid-credential") {
        errorMessage = "Error al autenticar. Intenta iniciar sesión.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Demasiados intentos. Intenta más tarde.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre completo</Label>
          <Input
            id="name"
            placeholder="Juan Pérez"
            autoComplete="name"
            {...register("name")}
            disabled={isLoading}
            className="h-11 rounded-xl border-slate-200 bg-white text-base"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_name">Nombre de tu negocio</Label>
          <Input
            id="business_name"
            placeholder="Mi Emprendimiento"
            autoComplete="organization"
            {...register("business_name")}
            disabled={isLoading}
            className="h-11 rounded-xl border-slate-200 bg-white text-base"
          />
          {errors.business_name && (
            <p className="text-sm text-destructive">
              {errors.business_name.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          {...register("email")}
          disabled={isLoading}
          className="h-11 rounded-xl border-slate-200 bg-white text-base"
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium leading-none">Fecha de nacimiento</legend>
        <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-2">
          <div className="space-y-1">
            <Label htmlFor="birth_month" className="text-xs text-muted-foreground">Mes</Label>
            <Controller
              name="birth_month"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="birth_month"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  items={BIRTH_MONTHS}
                  placeholder="Mes"
                  searchPlaceholder="Buscar mes..."
                  disabled={isLoading}
                  className="h-11 w-full border-slate-200 bg-white text-base"
                  contentClassName="min-w-48"
                />
              )}
            />
            {errors.birth_month && (
              <p className="text-xs text-destructive">{errors.birth_month.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="birth_day" className="text-xs text-muted-foreground">Día</Label>
            <Controller
              name="birth_day"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="birth_day"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  items={BIRTH_DAYS}
                  placeholder="Día"
                  searchPlaceholder="Buscar día..."
                  disabled={isLoading}
                  className="h-11 w-full border-slate-200 bg-white text-base"
                  contentClassName="min-w-36"
                />
              )}
            />
            {errors.birth_day && (
              <p className="text-xs text-destructive">{errors.birth_day.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="birth_year" className="text-xs text-muted-foreground">Año</Label>
            <Controller
              name="birth_year"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="birth_year"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  items={BIRTH_YEARS}
                  placeholder="Año"
                  searchPlaceholder="Buscar año..."
                  disabled={isLoading}
                  className="h-11 w-full border-slate-200 bg-white text-base"
                  contentClassName="min-w-40"
                  align="end"
                />
              )}
            />
            {errors.birth_year && (
              <p className="text-xs text-destructive">{errors.birth_year.message}</p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Se usa únicamente para comprobar elegibilidad y no se conserva.
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register("password")}
              disabled={isLoading}
              className="h-11 rounded-xl border-slate-200 bg-white pr-10 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register("confirmPassword")}
              disabled={isLoading}
              className="h-11 rounded-xl border-slate-200 bg-white pr-10 text-base"
            />
            <button
              type="button"
              onClick={() =>
                setShowConfirmPassword(!showConfirmPassword)
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
              tabIndex={-1}
            >
              {showConfirmPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" className="h-11 w-full rounded-xl bg-[#8cff00] text-base font-bold text-black hover:bg-[#7ce600]" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Creando cuenta…
          </>
        ) : (
          "Comenzar prueba de 30 días"
        )}
      </Button>

      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">
          30 días de prueba gratuita • Sin tarjeta de crédito
        </p>
        <p className="text-xs text-muted-foreground">
          No se realizará ningún cobro al terminar la prueba. Solo habrá renovación mensual si después eliges un plan pago, agregas un método de pago y confirmas la suscripción.
        </p>
        <p className="text-xs text-muted-foreground">
          Al crear una cuenta, aceptas nuestros{" "}
          <a href="/terms" className="underline hover:text-primary">
            términos de servicio
          </a>{" "}
          y{" "}
          <a href="/privacy" className="underline hover:text-primary">
            política de privacidad
          </a>.
        </p>
      </div>
    </form>
  );
}
