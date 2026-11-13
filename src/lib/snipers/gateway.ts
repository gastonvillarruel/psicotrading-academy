// Dependency boundary for the server facade and isolated tests. Never expose this as an action.
import type { Pool } from 'pg';
import { actorFromSession } from './session';
import { previewKey } from './preview';
import { reject } from './errors';
import { changePermission, PERMISSIONS, requirePermission, transaction } from './permissions';
import { z } from 'zod';
import { id, parse } from './contracts';
import * as commercial from './commercial';
import * as operations from './operations';
import * as queries from './queries';
import * as content from './content';
import type { DeliveryStorage, CleanupStorage } from './upload-storage';

type Session = Parameters<typeof actorFromSession>[0];
type Config = { enabled: string | undefined; singleSession: string | undefined; secret: string | undefined };

export function createSnipersGateway(pool: Pool, getSession: () => Promise<Session>, config: () => Config,
  storage:()=>DeliveryStorage=()=>reject('CONFIGURATION','Entrega no configurada.'),cleanup?:()=>CleanupStorage) {
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
    async linkResource(input:unknown) { return content.linkResource(pool,(await context()).actor,input); },
    async signResource(input:unknown) { return content.signResource(pool,(await context()).actor,input,storage); },
    async createClass(input: unknown) { return content.createClass(pool, (await context()).actor, input); },
    async saveClass(input: unknown) { return content.saveClass(pool, (await context()).actor, input); },
    async createCategory(input: unknown) { return content.createCategory(pool, (await context()).actor, input); },
    async saveCategory(input: unknown) { return content.saveCategory(pool, (await context()).actor, input); },
    async createMeeting(input: unknown) { return content.createMeeting(pool, (await context()).actor, input); },
    async saveMeeting(input: unknown) { return content.saveMeeting(pool, (await context()).actor, input); },
    async getEditorialMeeting(input: unknown) { return content.getEditorialMeeting(pool, (await context()).actor, input); },
    async transitionContent(input: unknown) { return content.transitionContent(pool, (await context()).actor, input,cleanup); },
    async listPublishedClasses(input: unknown) { return content.listPublishedClasses(pool, (await context()).actor, input); },
    async getPublishedClass(input: unknown) { return content.getPublishedClass(pool, (await context()).actor, input); },
    async listPublishedCategories() { return content.listCategories(pool, (await context()).actor); },
    async listEditorialCategories() { return content.listCategories(pool, (await context()).actor, true); },
    async listEditorialClasses(input: unknown) { return content.listEditorialClasses(pool, (await context()).actor, input); },
    async getEditorialClass(input: unknown) { return content.getEditorialClass(pool, (await context()).actor, input); },
    async listPublishedMeetings(input: unknown) { return content.listMeetings(pool, (await context()).actor, input); },
    async listEditorialMeetings(input: unknown) { return content.listMeetings(pool, (await context()).actor, input, true); },
    async getMeetingJoin(input: unknown) { return content.getMeetingJoin(pool, (await context()).actor, input); },
    async getEditorialHistory(input: unknown) { return content.getEditorialHistory(pool, (await context()).actor, input); },
    async getEditorialOperation(input: unknown) { return content.getEditorialOperation(pool, (await context()).actor, input); },
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
    async getCapabilities() { return commercial.getCapabilities(pool, (await context()).actor); },
    async getMyMembership() { return commercial.getMyMembership(pool, (await context()).actor); },
    async listMemberships(input: unknown) { return commercial.listMemberships(pool, (await context()).actor, input); },
    async getMemberIdentity(input: unknown) { return commercial.getMemberIdentity(pool, (await context()).actor, input); },
    async reconcileOperation(input: unknown) { return commercial.reconcileOperation(pool, (await context()).actor, input); },
    async getAssignablePlans() { return commercial.getAssignablePlans(pool, (await context()).actor); },
    async getCatalog() { return commercial.getCatalog(pool, (await context()).actor); },
    async updatePlan(input: unknown) { return commercial.updatePlan(pool, (await context()).actor, input); },
    async getPermissions(input: unknown) { return commercial.getPermissions(pool, (await context()).actor, input); },
    async getSupervisionHistory(input: unknown) { return commercial.getSupervisionHistory(pool, (await context()).actor, input); },
    async getHistoryView(input: unknown) { return commercial.getHistoryView(pool, (await context()).actor, input); },
    async setPermission(input: unknown) {
      const { actor } = await context();
      const c = parse(z.object({ userId: id, permission: z.enum(PERMISSIONS), grant: z.boolean() }).strict(), input);
      return changePermission(pool, actor, c.userId, c.permission, c.grant);
    },
    async requireContentEditor() {
      const { actor } = await context();
      await transaction(pool, tx => requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true));
    },
  };
}
