// components/auth/login-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { setTokenCookie, clearTokenCookie } from "@/lib/token-cookie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { push } = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setFormError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password,
      );

      const idToken = await userCredential.user.getIdToken();
      // Setear la cookie antes de navegar para que el proxy vea la sesión
      setTokenCookie(idToken);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const result = await response.json();

      if (!response.ok) {
        clearTokenCookie();
        await auth.signOut();
        throw new Error(result.error || "Error al iniciar sesión");
      }

      toast.success("¡Bienvenido de vuelta!");
      push("/dashboard");
    } catch (error: any) {
      console.error("Error en login:", error);

      let errorMessage = "Error al iniciar sesión. Intenta de nuevo.";

      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        errorMessage = "El email o la contraseña son incorrectos";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "El formato del email no es válido";
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "Esta cuenta ha sido deshabilitada. Contacta a soporte.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage =
          "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.";
      } else if (error.message === "Usuario no encontrado") {
        errorMessage = "No existe una cuenta asociada a este email";
      } else if (error.message === "Esta cuenta ha sido deshabilitada") {
        errorMessage = "Esta cuenta ha sido deshabilitada. Contacta a soporte.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      // Error visible en el form Y en el toast
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Error general del form */}
      {formError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          {...register("email")}
          disabled={isLoading}
          className={`h-12 rounded-xl bg-white text-base ${errors.email ? "border-destructive" : "border-slate-200"}`}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Contraseña</Label>
          <button
            type="button"
            className="text-sm font-semibold text-[#0068ff] hover:underline disabled:opacity-50"
            disabled={isResetting}
            onClick={async () => {
              const email = (
                document.getElementById("email") as HTMLInputElement
              )?.value;

              if (!email) {
                toast.error("Ingresa tu email primero");
                return;
              }

              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                toast.error("Ingresa un email válido");
                return;
              }

              setIsResetting(true);
              try {
                const res = await fetch("/api/auth/send-password-reset", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });

                if (res.status === 429) {
                  toast.error("Demasiados intentos. Espera unos minutos.");
                } else {
                  // Respuesta genérica (venga o no de una cuenta real) para
                  // no revelar si el email está registrado — la decide el
                  // propio endpoint, ver app/api/auth/send-password-reset.
                  toast.success(
                    "Si el email está registrado, recibirás un correo en breve",
                    { duration: 6000 },
                  );
                }
              } catch {
                // Error de red: misma respuesta genérica.
                toast.success(
                  "Si el email está registrado, recibirás un correo en breve",
                  { duration: 6000 },
                );
              } finally {
                setIsResetting(false);
              }
            }}
          >
            {isResetting ? "Enviando..." : "¿Olvidaste tu contraseña?"}
          </button>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Ingresa tu contraseña"
            autoComplete="current-password"
            {...register("password")}
            disabled={isLoading}
            className={`h-12 rounded-xl bg-white pr-10 text-base ${errors.password ? "border-destructive" : "border-slate-200"}`}
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

      <Button type="submit" className="h-12 w-full rounded-xl bg-[#8cff00] text-base font-bold text-black hover:bg-[#7ce600]" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Iniciando sesión…
          </>
        ) : (
          "Iniciar sesión"
        )}
      </Button>
    </form>
  );
}
