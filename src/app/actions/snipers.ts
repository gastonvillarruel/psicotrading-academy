'use server';

import { snipers } from '@/lib/snipers/server';
import { respond } from '@/lib/snipers/action-result';

export async function getSnipersCapabilities() { return respond(() => snipers.getCapabilities()); }
export async function getMySnipersMembership() { return respond(() => snipers.getMyMembership()); }
export async function listSnipersMembers(input: unknown) { return respond(() => snipers.listMemberships(input)); }
export async function searchSnipersUsers(input: unknown) {
  return respond(async () => (await snipers.searchMembers(input)).map(u => ({ id: u.id, name: u.name, email: u.email, membershipId: u.membershipId, status: u.status })));
}
export async function getSnipersMember(input: unknown) { return respond(() => snipers.getCommercialMembership(input)); }
export async function getSnipersMemberIdentity(input: unknown) { return respond(() => snipers.getMemberIdentity(input)); }
export async function reconcileSnipersOperation(input: unknown) { return respond(() => snipers.reconcileOperation(input)); }
export async function getSnipersHistory(input: unknown) { return respond(() => snipers.getHistoryView(input)); }
export async function getSnipersAssignablePlans() { return respond(() => snipers.getAssignablePlans()); }
export async function getSnipersCatalog() { return respond(() => snipers.getCatalog()); }
export async function updateSnipersPlan(input: unknown) { return respond(() => snipers.updatePlan(input)); }
export async function getSnipersPermissions(input: unknown) { return respond(() => snipers.getPermissions(input)); }
export async function getSnipersSupervisionHistory(input: unknown) { return respond(() => snipers.getSupervisionHistory(input)); }
export async function setSnipersPermission(input: unknown) { return respond(() => snipers.setPermission(input)); }
export async function createSnipersMembership(input: unknown) { return respond(() => snipers.createMembership(input)); }
export async function previewSnipersPayment(input: unknown) { return respond(() => snipers.previewPayment(input)); }
export async function confirmSnipersPayment(input: unknown) { return respond(() => snipers.confirmPayment(input)); }
export async function previewSnipersCourtesy(input: unknown) { return respond(() => snipers.previewCourtesy(input)); }
export async function confirmSnipersCourtesy(input: unknown) { return respond(() => snipers.confirmCourtesy(input)); }
export async function changeSnipersPlan(input: unknown) { return respond(() => snipers.changeRenewalPlan(input)); }
export async function changeSnipersStatus(input: unknown) { return respond(() => snipers.changeMembershipStatus(input)); }
export async function voidSnipersPayment(input: unknown) { return respond(() => snipers.voidPayment(input)); }
export async function voidSnipersCourtesy(input: unknown) { return respond(() => snipers.voidCourtesy(input)); }
