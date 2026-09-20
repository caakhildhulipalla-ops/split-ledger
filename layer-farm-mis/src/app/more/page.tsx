'use client';

/**
 * Everything that is not a daily job.
 *
 * Sync state lives here because it is the one thing a farmer needs to be able
 * to check before they trust the numbers: how much is still on this phone, and
 * when it last reached anywhere else.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Banner, Card, Icon, Item, KeyValue, Pill, SectionTitle, Sheet, TopBar, num } from '@/components/ui';
import { formatDay, today } from '@/domain/dates';
import { cloudEnabled } from '@/lib/config';
import { useAlerts, useFarmScope, usePermissions, useRecentLedger } from '@/lib/hooks';
import { useData } from '@/lib/store';
import { ROLE_LABEL } from '@/lib/types';
import { demoFarm, type SeedContext } from '@/lib/seed';

export default function MorePage() {
  return <AppShell><More /></AppShell>;
}

function More() {
  const router = useRouter();
  const { session, rows, queue, signOut, resetEverything, importRows, list } = useData();
  const permissions = usePermissions();
  const [farmId] = useFarmScope();
  const ledger = useRecentLedger(14, today());
  const alerts = useAlerts(ledger, farmId);

  const [confirmReset, setConfirmReset] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [busy, setBusy] = useState(false);

  const tenant = list('tenant')[0];
  const counts = {
    entries: list('daily-entry').length,
    purchases: list('feed-purchase').length,
    dispatches: list('dispatch').length,
    expenses: list('expense').length,
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tenant: tenant?.name ?? '',
      rows: [...rows.values()],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `layer-farm-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const loadDemo = async () => {
    if (!session) return;
    setBusy(true);
    const ctx: SeedContext = { tenantId: session.tenantId, userId: session.userId, role: 'owner' };
    await importRows(demoFarm(ctx), { queue: true });
    setBusy(false);
  };

  return (
    <>
      <TopBar title="More" sub={tenant?.name} />
      <div className="page">
        <SectionTitle>Sync</SectionTitle>
        <Card>
          <KeyValue rows={[
            { k: 'Records on this phone', v: num(rows.size) },
            { k: 'Waiting to upload', v: queue.pending === 0 ? 'Nothing' : num(queue.pending) },
            ...(queue.failed > 0 ? [{ k: 'Failed', v: num(queue.failed) }] : []),
            { k: 'Cloud', v: cloudEnabled() ? 'Configured' : 'Not set up' },
          ]} />
          {!cloudEnabled() && (
            <div className="mt-sm">
              <Banner tone="info">
                This phone holds everything and works without a signal. Add cloud
                sync when you want a second phone to see the same farm.
              </Banner>
            </div>
          )}
        </Card>

        <SectionTitle>Alerts</SectionTitle>
        <div className="card list" style={{ padding: 0 }}>
          <Item
            title="Today's alerts"
            meta={alerts.length === 0 ? 'Nothing needs attention' : `${alerts.length} to look at`}
            value={alerts.length > 0
              ? <Pill tone={alerts.some((a) => a.severity === 'critical') ? 'bad' : 'warn'}>{alerts.length}</Pill>
              : <Pill tone="good"><Icon.check size={13} /></Pill>}
            onClick={() => router.push('/more/alerts')}
          />
        </div>

        {permissions.masters && (
          <>
            <SectionTitle>The farm</SectionTitle>
            <div className="card list" style={{ padding: 0 }}>
              <Item title="Setup" meta="Farms, sheds, flocks, items, rates, people" onClick={() => router.push('/setup')} />
              <Item title="Flocks" meta="Production and profit by batch" onClick={() => router.push('/flocks')} />
            </div>
          </>
        )}

        <SectionTitle>What is recorded</SectionTitle>
        <Card>
          <KeyValue rows={[
            { k: 'Shed entries', v: num(counts.entries) },
            { k: 'Feed purchases', v: num(counts.purchases) },
            { k: 'Dispatches', v: num(counts.dispatches) },
            { k: 'Expenses', v: num(counts.expenses) },
          ]} />
        </Card>

        <SectionTitle>Data</SectionTitle>
        <div className="card list" style={{ padding: 0 }}>
          <Item title="Export everything" meta="A JSON file of every record" onClick={() => setShowExport(true)} />
          {permissions.masters && counts.entries === 0 && (
            <Item title="Load the demo farm" meta="Four months of a two-farm business" onClick={() => void loadDemo()} />
          )}
          {permissions.masters && (
            <Item title="Clear this device" meta="Removes everything stored here" onClick={() => setConfirmReset(true)} />
          )}
        </div>

        <SectionTitle>Signed in</SectionTitle>
        <Card>
          <div className="row-between">
            <div>
              <div className="strong">{session?.userName}</div>
              <div className="small muted">{session ? ROLE_LABEL[session.role] : ''}</div>
            </div>
            <button className="btn sm" onClick={() => void signOut().then(() => router.replace('/signin'))}>Sign out</button>
          </div>
        </Card>

        <p className="tiny muted center" style={{ marginTop: 24 }}>
          Layer Farm MIS · {formatDay(today())}
        </p>
      </div>

      {showExport && (
        <Sheet open onClose={() => setShowExport(false)} title="Export everything"
          actions={<>
            <button className="btn" onClick={() => setShowExport(false)}>Cancel</button>
            <button className="btn primary" onClick={exportJson}>Download</button>
          </>}>
          <p className="small dim" style={{ lineHeight: 1.6 }}>
            Every record this device holds, as one JSON file — {num(rows.size)} rows.
            It is your data; keep a copy wherever you like.
          </p>
        </Sheet>
      )}

      {confirmReset && (
        <Sheet open onClose={() => setConfirmReset(false)} title="Clear this device?"
          actions={<>
            <button className="btn" onClick={() => setConfirmReset(false)}>Keep everything</button>
            <button className="btn danger" disabled={busy} onClick={async () => {
              setBusy(true);
              await resetEverything();
              router.replace('/signin');
            }}>Clear it</button>
          </>}>
          <Banner tone="bad" title="This cannot be undone">
            All {num(rows.size)} records on this phone are removed, including anything
            not yet uploaded. Export first if you want a copy.
          </Banner>
        </Sheet>
      )}
    </>
  );
}
