import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import MemberDetail from '@/components/snipers/MemberDetail';
export default async function SnipersStudent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await pageData(() => snipers.getCommercialMembership(id));
  const identity = await pageData(() => snipers.getMemberIdentity(id));
  const plans = await pageData(() => snipers.getAssignablePlans());
  const history = await pageData(() => snipers.getHistoryView({ membershipId: id, limit: 15, offset: 0 }));
  const caps = await pageData(() => snipers.getCapabilities());
  return <MemberDetail owner={caps.identity} member={member} identity={identity} plans={plans} initialHistory={history} />;
}
