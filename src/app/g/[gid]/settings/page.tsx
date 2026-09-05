import { headers } from 'next/headers';
import { loadGroup } from '@/lib/ledger';
import { createClient } from '@/lib/supabase/server';
import SettingsView from '@/components/SettingsView';
import type { GroupInvite } from '@/lib/types';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const data = await loadGroup(gid);

  const supabase = await createClient();
  const { data: invites } = await supabase
    .from('group_invites')
    .select('*')
    .eq('group_id', gid)
    .order('created_at', { ascending: false });

  // Build invite links against the host actually serving this request, so
  // they work on a preview deployment and a custom domain alike.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : '');

  return (
    <SettingsView
      data={data}
      invites={(invites ?? []) as GroupInvite[]}
      origin={origin}
    />
  );
}
