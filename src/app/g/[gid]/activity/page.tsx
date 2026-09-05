import { loadGroup } from '@/lib/ledger';
import ActivityView from '@/components/ActivityView';

export const metadata = { title: 'Activity' };

export default async function ActivityPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const data = await loadGroup(gid);
  return <ActivityView data={data} />;
}
