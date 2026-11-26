'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { applyActionCode, checkActionCode } from 'firebase/auth';
import { auth, authReady } from '@/lib/firebase';
import { meetsPasswordPolicy } from '@/lib/password-policy';
import { PasswordRequirements } from '@/components/auth/password-requirements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HiKontaIcon } from '@/components/shared/hikonta-icon';
import { HiKontaTitle } from '@/components/shared/hikonta-title';
import { LoadingScreen } from '@/hooks/ui/loading-screen';
import { CheckCircle2, XCircle, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';

type Status = 'loading' | 'verify-success' | 'reset-form' | 'reset-success' | 'recover-success' | 'error' | 'reset-retry';

async function requestPasswordReset(oobCode: string, newPassword?: string, signal?: AbortSignal) {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode, newPassword }),
    signal,
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}

function actionErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'auth/expired-action-code':
      return 'Este enlace ha expirado. Solicita uno nuevo.';
    case 'auth/invalid-action-code':
      return 'Este enlace no es válido o ya fue utilizado.';
    case 'auth/user-disabled':
      return 'Esta cuenta ha sido deshabilitada.';
    case 'auth/user-not-found':
      return 'No se encontró ninguna cuenta asociada a este enlace.';
    default:
      return 'Ocurrió un error al procesar el enlace. Intenta de nuevo.';
  }
}

function ActionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="bg-background rounded-2xl border shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-2">
            <HiKontaIcon className="size-10 shadow-lg shadow-primary/50 rounded-lg" />
            <HiKontaTitle className="h-6" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthActionHandler() {
  const searchParams = useSearchParams();
  const { push } = useRouter();

  const mode = searchParams.get('mode');
  const queryCode = searchParams.get('oobCode');

  const [status, setStatus] = useState<Status>('loading');
  const [resetCode, setResetCode] = useState('');
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const oobCode = mode === 'resetPassword'
      ? new URLSearchParams(window.location.hash.slice(1)).get('oobCode') ?? queryCode
      : queryCode;

    setStatus('loading');
    if (!mode || !oobCode) {
      setErrorMessage('Este enlace es inválido o está incompleto.');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        if (mode === 'resetPassword') {
          const { response, result } = await requestPasswordReset(oobCode, undefined, controller.signal);
          if (controller.signal.aborted) return;
          if (!response.ok || typeof result?.email !== 'string') {
            setErrorMessage(result?.error ?? 'No se pudo comprobar el enlace. Intenta de nuevo.');
            setStatus(result?.code === 'invalid-link' ? 'error' : 'reset-retry');
            return;
          }
          setResetCode(oobCode);
          setResetEmail(result.email);
          setStatus('reset-form');
          return;
        }

        await authReady;
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          setStatus('verify-success');
        } else if (mode === 'recoverEmail') {
          await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setStatus('recover-success');
        } else {
          setErrorMessage('Este tipo de enlace no es compatible.');
          setStatus('error');
        }
      } catch (error) {
        if (mode === 'resetPassword' && controller.signal.aborted) return;
        setErrorMessage(actionErrorMessage(error));
        setStatus(mode === 'resetPassword' ? 'reset-retry' : 'error');
      }
    })();
    return () => controller.abort();
  }, [mode, queryCode, verificationAttempt]);

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode || isSubmitting) return;

    if (!meetsPasswordPolicy(password)) {
      setPasswordError('La contraseña no cumple los requisitos.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }
    setPasswordError('');

    setIsSubmitting(true);
    try {
      const { response, result } = await requestPasswordReset(resetCode, password);
      if (!response.ok || result?.ok !== true) {
        const message = result?.error ?? 'No se pudo actualizar la contraseña. Intenta de nuevo.';
        if (result?.code === 'invalid-link') {
          setErrorMessage(message);
          setStatus('error');
        } else {
          setPasswordError(message);
        }
        return;
      }
      setPassword('');
      setConfirmPassword('');
      setResetCode('');
      setStatus('reset-success');
    } catch {
      setPasswordError('No se pudo confirmar el cambio. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <ActionCard>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Procesando tu solicitud…</p>
        </div>
      </ActionCard>
    );
  }

  if (status === 'error' || status === 'reset-retry') {
    return (
      <ActionCard>
        <div className="space-y-3">
          <div className="size-14 bg-destructive/10 rounded-full flex items-center justify-center">
            <XCircle className="size-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">{status === 'error' ? 'Enlace no válido' : 'No pudimos comprobar el enlace'}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{errorMessage}</p>
        </div>
        {status === 'reset-retry' ? (
          <Button className="w-full" onClick={() => setVerificationAttempt((attempt) => attempt + 1)}>
            Volver a intentar
          </Button>
        ) : (
          <Button className="w-full" onClick={() => window.location.replace('/login')}>
            Ir a iniciar sesión
          </Button>
        )}
      </ActionCard>
    );
  }

  if (status === 'verify-success') {
    return (
      <ActionCard>
        <div className="space-y-3">
          <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle2 className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">¡Email verificado!</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Tu cuenta ha sido activada correctamente. Ya puedes continuar usando HiKonta.
          </p>
        </div>
        <Button className="w-full" onClick={() => push('/verify-email')}>
          Continuar
        </Button>
      </ActionCard>
    );
  }

  if (status === 'reset-form') {
    return (
      <ActionCard>
        <div className="space-y-3">
          <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center">
            <KeyRound className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Crea una nueva contraseña</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Para la cuenta <span className="font-medium text-foreground">{resetEmail}</span>
          </p>
        </div>

        <form onSubmit={handleConfirmReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                maxLength={4096}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <PasswordRequirements password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirmar contraseña</Label>
            <Input
              id="confirm-new-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              maxLength={4096}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar contraseña'
            )}
          </Button>
        </form>
      </ActionCard>
    );
  }

  if (status === 'reset-success') {
    return (
      <ActionCard>
        <div className="space-y-3">
          <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle2 className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Contraseña actualizada</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            El enlace ya fue utilizado. Inicia sesión con tu nueva contraseña.
          </p>
        </div>
        <Button className="w-full" onClick={() => window.location.replace('/login')}>
          Ir a iniciar sesión
        </Button>
      </ActionCard>
    );
  }

  // recover-success
  return (
    <ActionCard>
      <div className="space-y-3">
        <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center">
          <CheckCircle2 className="size-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Email restaurado</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Revertimos el cambio de correo de tu cuenta. Si no reconoces esta actividad, te
          recomendamos actualizar tu contraseña.
        </p>
      </div>
      <Button className="w-full" onClick={() => push('/login')}>
        Ir a iniciar sesión
      </Button>
    </ActionCard>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthActionHandler />
    </Suspense>
  );
}
