import { loadGroup } from '@/lib/ledger';
import LedgerView from '@/components/LedgerView';

export default async function LedgerPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const data = await loadGroup(gid);
  return <LedgerView data={data} />;
}
