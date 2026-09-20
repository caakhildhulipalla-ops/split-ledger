'use client';

import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Banner, TopBar } from '@/components/ui';
import { today } from '@/domain/dates';
import { useAlerts, useFarmScope, useRecentLedger } from '@/lib/hooks';

export default function AlertsPage() {
  return <AppShell><Alerts /></AppShell>;
}

function Alerts() {
  const router = useRouter();
  const [farmId] = useFarmScope();
  const ledger = useRecentLedger(14, today());
  const alerts = useAlerts(ledger, farmId);

  return (
    <>
      <TopBar title="Alerts" onBack={() => router.back()} />
      <div className="page">
        {alerts.length === 0 ? (
          <div className="empty" style={{ marginTop: 40 }}>
            <h3>Nothing needs attention</h3>
            <p>Production, mortality, feed cover, entries and vaccinations are all where they should be.</p>
          </div>
        ) : (
          <div className="stack-sm" style={{ marginTop: 14 }}>
            {alerts.map((alert) => (
              <Banner
                key={alert.key}
                tone={alert.severity === 'critical' ? 'bad' : alert.severity === 'warn' ? 'warn' : 'info'}
                title={alert.title}
              >
                {alert.detail}
              </Banner>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
