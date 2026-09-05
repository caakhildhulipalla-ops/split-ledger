import { loadGroup } from '@/lib/ledger';
import DashboardView from '@/components/DashboardView';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const data = await loadGroup(gid);
  return <DashboardView data={data} />;
}
