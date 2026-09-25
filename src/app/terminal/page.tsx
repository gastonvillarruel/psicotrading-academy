import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getValidatedSession } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { getTerminalUrl, isTerminalConfigured, signTerminalPass } from '@/lib/terminal-sso';

export const dynamic = 'force-dynamic';

// Puente hacia la terminal de trading: no se ve nada, solo redirige. Si no hay
// sesión, pasa por el login y vuelve aquí.
export default async function TerminalPage() {
  // Sin conectar todavía: un aviso, no un error, por si alguien llega con el enlace.
  if (!isTerminalConfigured()) {
    return (
      <main className="min-h-[calc(100vh-140px)] bg-slate-50 py-20 px-4">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-extrabold text-brand-text tracking-tight">Terminal de trading</h1>
          <p className="text-brand-text-muted mt-3">La terminal estará disponible muy pronto.</p>
          <Link href="/" className="inline-block mt-6 text-sm font-semibold text-brand-primary hover:underline">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  const session = await getValidatedSession();

  if (!session?.user?.id || session.error === 'SessionExpired') {
    redirect('/login?callbackUrl=/terminal');
  }

  if (!session.user.emailVerified) {
    redirect('/confirmar-email-pendiente');
  }

  // Del registro y no del token: el nombre o el correo pueden haber cambiado.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, timezone: true },
  });

  if (!user) {
    redirect('/login?callbackUrl=/terminal');
  }

  const pass = signTerminalPass(user);
  redirect(`${getTerminalUrl()}/sso?token=${encodeURIComponent(pass)}`);
}
