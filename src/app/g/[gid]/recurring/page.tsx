import { loadGroup } from '@/lib/ledger';
import RecurringView from '@/components/RecurringView';

export const metadata = { title: 'Recurring' };

export default async function RecurringPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const data = await loadGroup(gid);
  return <RecurringView data={data} />;
}
