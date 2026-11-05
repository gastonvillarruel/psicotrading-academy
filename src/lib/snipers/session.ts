import type { Actor } from './permissions';
import { reject } from './errors';

type Session = { expires?: string; error?: string; user?: { id?: string; activeSessionId?: string | null } } | null;

// Input MUST come from NextAuth getServerSession, which decrypts and validates the JWT.
// Session.expires is rolling metadata, not an independent JWT verification mechanism.
// NextAuth's one-argument server adapter omits expires; do not synthesize it.
export function actorFromSession(session: Session, singleSession: string | undefined): Actor {
  if (singleSession !== undefined && singleSession !== 'true' && singleSession !== 'false') reject('CONFIGURATION', 'Configuración de sesión inválida.');
  if (!session?.user?.id || session.error) {
    reject('SESSION', 'Sesión no válida.');
  }
  if (session.expires !== undefined && (!Number.isFinite(Date.parse(session.expires)) || Date.parse(session.expires) <= Date.now())) {
    reject('SESSION', 'Sesión no válida.');
  }
  const single = singleSession !== 'false';
  if (single && !session.user.activeSessionId) reject('SESSION', 'Sesión no válida.');
  return { userId: session.user.id, activeSessionId: session.user.activeSessionId ?? null, singleSession: single };
}
