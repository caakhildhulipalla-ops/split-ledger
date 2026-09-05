import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadGroup, postDueRecurring } from '@/lib/ledger';
import { signOut } from '@/app/actions';
import GroupSwitcher from '@/components/GroupSwitcher';
import Tabs from '@/components/Tabs';

export async function generateMetadata({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('groups').select('name').eq('id', gid).maybeSingle();
  return { title: data?.name ?? 'Group' };
}

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ gid: string }>;
}) {
  const { gid } = await params;
  const data = await loadGroup(gid);

  // Post any recurring month that has come due. Safe to run on every load:
  // the unique index on (recurring_id, recurring_period) means the second
  // device to arrive writes nothing rather than duplicating rent.
  await postDueRecurring(data);

  const supabase = await createClient();
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name')
    .order('created_at');

  const me = data.members.find((m) => m.id === data.meMemberId);

  return (
    <>
      <div className="mast">
        <div className="mast-in">
          <Link href="/groups" className="brand">
            <span className="rule-mark" />
            <h1>Split Ledger</h1>
          </Link>

          <GroupSwitcher groups={groups ?? []} current={gid} />

          {me && (
            <span className="picker">
              <span className="lbl">You are</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{me.display_name}</span>
            </span>
          )}

          <span className="mast-spacer" />
          <Link className="btn btn-sm" href={`/g/${gid}/settings`}>
            Settings
          </Link>
          <form action={signOut}>
            <button className="btn btn-sm btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <Tabs gid={gid} />

      <div className="wrap">{children}</div>
    </>
  );
}
