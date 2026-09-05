'use client';

import Link from 'next/link';

export const GROUP_TABS = [
  ['ledger', 'Ledger'],
  ['balances', 'Balances'],
  ['dashboard', 'Dashboard'],
  ['recurring', 'Recurring'],
  ['activity', 'Activity'],
] as const;

export type GroupTab = (typeof GROUP_TABS)[number][0];

export default function Tabs({ gid, active }: { gid: string; active: string }) {
  return (
    <div className="tabs">
      <div className="tabs-in">
        {GROUP_TABS.map(([slug, label]) => (
          <Link
            key={slug}
            href={`/g?id=${gid}&tab=${slug}`}
            className="tab"
            aria-current={active === slug ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
