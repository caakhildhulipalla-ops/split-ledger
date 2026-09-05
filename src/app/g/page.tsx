'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RequireAuth, FullScreenLoader } from '@/lib/auth';
import { useGroup, useGroupList, useInvites } from '@/lib/hooks';
import { signOut } from '@/lib/mutations';
import { siteOrigin } from '@/lib/config';
import GroupSwitcher from '@/components/GroupSwitcher';
import Tabs, { GROUP_TABS } from '@/components/Tabs';
import LedgerView from '@/components/LedgerView';
import BalancesView from '@/components/BalancesView';
import DashboardView from '@/components/DashboardView';
import RecurringView from '@/components/RecurringView';
import ActivityView from '@/components/ActivityView';
import SettingsView from '@/components/SettingsView';

const VALID_TABS = new Set<string>([...GROUP_TABS.map(([s]) => s), 'settings']);

function GroupShell() {
  const params = useSearchParams();
  const router = useRouter();

  const id = params.get('id');
  const tabParam = params.get('tab') ?? 'ledger';
  const tab = VALID_TABS.has(tabParam) ? tabParam : 'ledger';

  const { data, loading, notFound, error } = useGroup(id);
  const groups = useGroupList();
  const invites = useInvites(tab === 'settings' ? id : null);

  useEffect(() => {
    if (!id) router.replace('/groups');
  }, [id, router]);

  useEffect(() => {
    if (data?.group.name) document.title = `${data.group.name} · Split Ledger`;
  }, [data?.group.name]);

  if (!id) return <FullScreenLoader />;
  if (notFound) return <Card title="Group not found">
    <p style={{ marginTop: 0 }}>
      This group does not exist, or you are not a member of it.
    </p>
  </Card>;
  if (error && !data) return <Card title="Could not load this group">
    <p className="hint bad" style={{ marginTop: 0 }}>{error}</p>
  </Card>;
  if (!data) return <FullScreenLoader />;

  const me = data.members.find((m) => m.id === data.meMemberId);

  return (
    <>
      <div className="mast">
        <div className="mast-in">
          <Link href="/groups" className="brand">
            <span className="rule-mark" />
            <h1>Split Ledger</h1>
          </Link>

          <GroupSwitcher groups={groups} current={id} />

          {me && (
            <span className="picker">
              <span className="lbl">You are</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{me.display_name}</span>
            </span>
          )}

          <span className="mast-spacer" />
          <Link className="btn btn-sm" href={`/g?id=${id}&tab=settings`}>
            Settings
          </Link>
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            onClick={async () => {
              await signOut();
              router.push('/signin');
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <Tabs gid={id} active={tab} />

      <div className="wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
        {tab === 'ledger' && <LedgerView data={data} />}
        {tab === 'balances' && <BalancesView data={data} />}
        {tab === 'dashboard' && <DashboardView data={data} />}
        {tab === 'recurring' && <RecurringView data={data} />}
        {tab === 'activity' && <ActivityView data={data} />}
        {tab === 'settings' && (
          <SettingsView data={data} invites={invites.data ?? []} origin={siteOrigin()} />
        )}
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="wrap-narrow">
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
        </div>
        <div className="sheet-body">{children}</div>
        <div className="modal-foot">
          <Link className="btn btn-primary" href="/groups">
            Go to your groups
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <RequireAuth>
        <GroupShell />
      </RequireAuth>
    </Suspense>
  );
}
