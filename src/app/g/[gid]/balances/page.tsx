import { loadGroup } from '@/lib/ledger';
import BalancesView from '@/components/BalancesView';

export const metadata = { title: 'Balances' };

export default async function BalancesPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const data = await loadGroup(gid);
  return <BalancesView data={data} />;
}
