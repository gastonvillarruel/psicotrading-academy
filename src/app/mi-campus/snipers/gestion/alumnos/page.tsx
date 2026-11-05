import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import MemberList from '@/components/snipers/MemberList';
export default async function SnipersStudents() {
  const initial = await pageData(() => snipers.listMemberships({ limit: 20, offset: 0 }));
  const plans = await pageData(() => snipers.getAssignablePlans());
  return <MemberList initial={initial} plans={plans} />;
}
