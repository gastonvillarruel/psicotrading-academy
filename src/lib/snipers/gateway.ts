// Dependency boundary for the server facade and isolated tests. Never expose this as an action.
import type { Pool } from 'pg';
import { actorFromSession } from './session';
import { previewKey } from './preview';
import { reject } from './errors';
import { requirePermission, transaction } from './permissions';
import * as operations from './operations';
import * as queries from './queries';

type Session = Parameters<typeof actorFromSession>[0];
type Config = { enabled: string | undefined; singleSession: string | undefined; secret: string | undefined };

export function createSnipersGateway(pool: Pool, getSession: () => Promise<Session>, config: () => Config) {
  async function context() {
    const env = config();
    if (env.enabled !== 'true') reject('DISABLED', 'Snipers deshabilitado.');
    const key = previewKey(env.secret); // Explicit secret: no NextAuth development fallback.
    const actor = actorFromSession(await getSession(), env.singleSession);
    return { key, actor };
  }
  async function command(fn: typeof operations.createMembership, input: unknown) {
    return fn(pool, (await context()).actor, input);
  }
  return {
    createMembership: (input: unknown) => command(operations.createMembership, input),
    changeRenewalPlan: (input: unknown) => command(operations.changeRenewalPlan, input),
    changeMembershipStatus: (input: unknown) => command(operations.changeMembershipStatus, input),
    voidPayment: (input: unknown) => command(operations.voidPayment, input),
    voidCourtesy: (input: unknown) => command(operations.voidCourtesy, input),
    async previewPayment(input: unknown) { const c = await context(); return operations.previewPayment(pool, c.actor, input, c.key); },
    async confirmPayment(input: unknown) { const c = await context(); return operations.confirmPayment(pool, c.actor, input, c.key); },
    async previewCourtesy(input: unknown) { const c = await context(); return operations.previewCourtesy(pool, c.actor, input, c.key); },
    async confirmCourtesy(input: unknown) { const c = await context(); return operations.confirmCourtesy(pool, c.actor, input, c.key); },
    async searchMembers(input: unknown) { return queries.searchMembers(pool, (await context()).actor, input); },
    async getCommercialMembership(input: unknown) { return queries.getCommercialMembership(pool, (await context()).actor, input); },
    async getCommercialHistory(input: unknown) { return queries.getCommercialHistory(pool, (await context()).actor, input); },
    async getAcademicAccess() { return queries.getAcademicAccess(pool, (await context()).actor); },
    async requireContentEditor() {
      const { actor } = await context();
      await transaction(pool, tx => requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true));
    },
  };
}
