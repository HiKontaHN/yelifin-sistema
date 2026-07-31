'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { setTokenCookie } from '@/lib/token-cookie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HiKontaIcon } from '@/components/shared/hikonta-icon';
import { HiKontaTitle } from '@/components/shared/hikonta-title';
import { LoadingScreen } from '@/hooks/ui/loading-screen';
import { CheckCircle2, XCircle, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';

type Status = 'loading' | 'verify-success' | 'reset-form' | 'reset-success' | 'recover-success' | 'error';

function actionErrorMessage(error: any): string {
  switch (error?.code) {
    case 'auth/expired-action-code':
      return 'Este enlace ha expirado. Solicita uno nuevo.';
    case 'auth/invalid-action-code':
      return 'Este enlace no es válido o ya fue utilizado.';
    case 'auth/user-disabled':
      return 'Esta cuenta ha sido deshabilitada.';
    case 'auth/user-not-found':
      return 'No se encontró ninguna cuenta asociada a este enlace.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
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
  const oobCode = searchParams.get('oobCode');

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!mode || !oobCode) {
      setErrorMessage('Este enlace es inválido o está incompleto.');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);

          if (auth.currentUser) {
            await auth.currentUser.reload();
            const freshToken = await auth.currentUser.getIdToken(true);
            setTokenCookie(freshToken);
          }

          setStatus('verify-success');
        } else if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setResetEmail(email);
          setStatus('reset-form');
        } else if (mode === 'recoverEmail') {
          await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setStatus('recover-success');
        } else {
          setErrorMessage('Este tipo de enlace no es compatible.');
          setStatus('error');
        }
      } catch (error: any) {
        setErrorMessage(actionErrorMessage(error));
        setStatus('error');
      }
    })();
  }, [mode, oobCode]);

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode) return;

    if (password.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }
    setPasswordError('');

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus('reset-success');
    } catch (error: any) {
      setErrorMessage(actionErrorMessage(error));
      setStatus('error');
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

  if (status === 'error') {
    return (
      <ActionCard>
        <div className="space-y-3">
          <div className="size-14 bg-destructive/10 rounded-full flex items-center justify-center">
            <XCircle className="size-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Enlace no válido</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{errorMessage}</p>
        </div>
        <Button className="w-full" onClick={() => push('/login')}>
          Ir a iniciar sesión
        </Button>
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
        <Button className="w-full" onClick={() => push(auth.currentUser ? '/verify-email' : '/login')}>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirmar contraseña</Label>
            <Input
              id="confirm-new-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}

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
            Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
        </div>
        <Button className="w-full" onClick={() => push('/login')}>
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
