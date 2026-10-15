import Link from "next/link";
import { HiKontaTitle } from "@/components/shared/hikonta-title";

export const metadata = {
  title: "Cancelar correos de marketing — HiKonta",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; success?: string }>;
}) {
  const { token = "", success } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-5 py-12 text-center">
      <Link href="/" className="mx-auto"><HiKontaTitle className="h-7" /></Link>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Correos de marketing</h1>
        {success === "1" ? (
          <p className="mt-3 text-muted-foreground">
            Listo. Ya no recibirás correos promocionales de HiKonta. Los mensajes necesarios para seguridad, facturación y funcionamiento de tu cuenta no se ven afectados.
          </p>
        ) : token ? (
          <>
            <p className="mt-3 text-muted-foreground">
              Confirma que deseas dejar de recibir promociones y novedades de HiKonta.
            </p>
            <form action="/api/marketing/unsubscribe" method="post" className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button className="h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground">
                Cancelar correos de marketing
              </button>
            </form>
          </>
        ) : (
          <p className="mt-3 text-muted-foreground">Este enlace de baja no es válido.</p>
        )}
      </div>
      <Link href="/" className="text-sm text-primary hover:underline">Volver a HiKonta</Link>
    </main>
  );
}
