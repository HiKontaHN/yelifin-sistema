// components/auth/login-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider, linkWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut,
  type OAuthCredential, type User,
} from "firebase/auth";
import { auth, authReady } from "@/lib/firebase";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { GoogleIcon } from "@/components/auth/google-icon";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignInMethod = "password" | "google";

export function LoginForm() {
  const { push } = useRouter();
  const { mutate } = useSWRConfig();
  const [signingIn, setSigningIn] = useState<SignInMethod | null>(null);
  const [pendingGoogle, setPendingGoogle] = useState<{ email: string; credential: OAuthCredential } | null>(null);
  const isLoading = signingIn !== null;
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const signIn = async (method: SignInMethod, authenticate: () => Promise<User>) => {
    setSigningIn(method);
    setFormError(null);

    try {
      await authReady;
      const user = await authenticate();

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await user.getIdToken(true) }),
      });

      const result = await response.json();

      if (method === "google" && response.status === 404 && result.code === "google_registration_required") {
        push("/register?google=1");
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || "Error al iniciar sesión");
      }

      await signOut(auth);
      await mutate("/api/auth/me");
      toast.success("¡Bienvenido de vuelta!");
      push("/dashboard");
    } catch (error) {
      await signOut(auth).catch(() => undefined);
      const code = error instanceof FirebaseError ? error.code : undefined;
      const message = error instanceof Error ? error.message : undefined;

      let errorMessage = "Error al iniciar sesión. Intenta de nuevo.";

      if (method === "google" && error instanceof FirebaseError && code === "auth/account-exists-with-different-credential") {
        const credential = GoogleAuthProvider.credentialFromError(error);
        const email = error.customData?.email;
        if (credential && typeof email === "string") {
          setPendingGoogle({ email, credential });
          setValue("email", email, { shouldValidate: true });
        }
        errorMessage = "Inicia sesión con tu correo y contraseña para vincular Google a tu cuenta.";
      } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      } else if (code === "auth/popup-blocked") {
        errorMessage = "Habilita las ventanas emergentes para iniciar sesión con Google.";
      } else if (method === "google" && message === "Credenciales inválidas") {
        errorMessage = "No pudimos acceder a una cuenta de HiKonta con este inicio de sesión. Si ya tienes una cuenta, entra con tu correo y contraseña.";
      } else if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        errorMessage = "El email o la contraseña son incorrectos";
      } else if (code === "auth/invalid-email") {
        errorMessage = "El formato del email no es válido";
      } else if (code === "auth/user-disabled") {
        errorMessage = "Esta cuenta ha sido deshabilitada. Contacta a soporte.";
      } else if (code === "auth/too-many-requests") {
        errorMessage =
          "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.";
      } else if (message === "Usuario no encontrado") {
        errorMessage = "No existe una cuenta asociada a este email";
      } else if (message === "Esta cuenta ha sido deshabilitada") {
        errorMessage = "Esta cuenta ha sido deshabilitada. Contacta a soporte.";
      } else if (!code && message) {
        errorMessage = message;
      }

      // Error visible en el form Y en el toast
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSigningIn(null);
    }
  };

  const onSubmit = (data: LoginFormData) => signIn("password", async () => {
    const { user } = await signInWithEmailAndPassword(auth, data.email, data.password);
    if (pendingGoogle && user.email?.toLowerCase() === pendingGoogle.email.toLowerCase()) {
      setPendingGoogle(null);
      try {
        await linkWithCredential(user, pendingGoogle.credential);
      } catch {
        toast.error("No se pudo vincular Google. Puedes seguir entrando con tu contraseña.");
      }
    }
    return user;
  });

  const signInWithGoogle = () => {
    setPendingGoogle(null);
    return signIn("google", async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, provider);
      return user;
    });
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
        {signingIn === "password" ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Iniciando sesión…
          </>
        ) : (
          "Iniciar sesión"
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full rounded-xl border-slate-200 bg-white text-base text-slate-950"
        disabled={isLoading}
        onClick={() => void signInWithGoogle()}
      >
        {signingIn === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
        Continuar con Google
      </Button>
    </form>
  );
}
