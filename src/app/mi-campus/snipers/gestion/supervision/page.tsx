import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import Supervision from '@/components/snipers/Supervision';
export default async function SnipersSupervision() {
  const plans = await pageData(() => snipers.getCatalog());
  const history = await pageData(() => snipers.getSupervisionHistory({ limit: 15, offset: 0 }));
  return <Supervision initial={plans} initialHistory={history} />;
}
