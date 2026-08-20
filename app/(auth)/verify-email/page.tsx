'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { setTokenCookie } from '@/lib/token-cookie';
import { useAuth } from '@/hooks/use-auth';
import { LoadingScreen } from '@/hooks/ui/loading-screen';
import { Button } from '@/components/ui/button';
import { HiKontaIcon } from '@/components/shared/hikonta-icon';
import { HiKontaTitle } from '@/components/shared/hikonta-title';
import { Mail, LogOut, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const RESEND_COOLDOWN = 60;

export default function VerifyEmailPage() {
  const { firebaseUser, loading, emailVerified } = useAuth();
  const { push } = useRouter();
  const [isSending,   setIsSending]   = useState(false);
  const [isChecking,  setIsChecking]  = useState(false);
  const [cooldown,    setCooldown]    = useState(0);

  useEffect(() => {
    if (loading) return;
    if (emailVerified) { push('/onboarding'); return; }
    if (!firebaseUser) { push('/login'); return; }
  }, [firebaseUser, loading, emailVerified, push]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!firebaseUser || cooldown > 0) return;
    setIsSending(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (res.status === 429) {
        toast.error('Demasiados intentos. Espera unos minutos.');
        return;
      }
      if (!res.ok) throw new Error('send-verification-email failed');

      toast.success('Correo enviado. Revisa tu bandeja de entrada.');
      setCooldown(RESEND_COOLDOWN);
    } catch {
      toast.error('Error al enviar el correo. Intenta de nuevo.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!firebaseUser) return;
    setIsChecking(true);
    try {
      await firebaseUser.reload();
      if (firebaseUser.emailVerified) {
        // Refrescar el token para que la cookie lleve email_verified=true;
        // si no, el proxy redirige de vuelta a /verify-email (loop).
        const freshToken = await firebaseUser.getIdToken(true);
        setTokenCookie(freshToken);
        toast.success('¡Email verificado! Configurando tu cuenta...');
        push('/onboarding');
      } else {
        toast.error('Tu email aún no ha sido verificado.');
      }
    } catch {
      toast.error('Error al verificar. Intenta de nuevo.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    push('/login');
  };

  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="bg-background rounded-2xl border shadow-sm p-8 space-y-6">

          <div className="flex items-center gap-2">
            <HiKontaIcon className="size-10 shadow-lg shadow-primary/50 rounded-lg" />
            <HiKontaTitle className="h-6" />
          </div>

          <div className="space-y-3">
            <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center">
              <Mail className="size-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Verifica tu email</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Te enviamos un correo de verificación a{' '}
              <span className="font-medium text-foreground">{firebaseUser.email}</span>.
              Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">Registrado como</p>
            <p className="font-medium text-sm">{firebaseUser.displayName}</p>
            <p className="text-sm text-muted-foreground">{firebaseUser.email}</p>
          </div>

          <div className="space-y-3">
            <Button className="w-full" onClick={handleCheckVerification} disabled={isChecking}>
              {isChecking ? (
                <><RefreshCw className="size-4 mr-2 animate-spin" />Verificando…</>
              ) : (
                'Ya verifiqué mi email'
              )}
            </Button>

            <Button variant="outline" className="w-full" onClick={handleResend} disabled={isSending || cooldown > 0}>
              {isSending ? (
                <><RefreshCw className="size-4 mr-2 animate-spin" />Enviando…</>
              ) : cooldown > 0 ? (
                `Reenviar en ${cooldown}s`
              ) : (
                'Reenviar correo de verificación'
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            ¿No encuentras el correo? Revisa tu carpeta de spam.
          </p>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="size-4" />
            Cerrar sesión y usar otra cuenta
          </button>
        </div>
      </div>
    </div>
  );
}