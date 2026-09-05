'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  ['', 'Ledger'],
  ['balances', 'Balances'],
  ['dashboard', 'Dashboard'],
  ['recurring', 'Recurring'],
  ['activity', 'Activity'],
] as const;

export default function Tabs({ gid }: { gid: string }) {
  const pathname = usePathname();
  const base = `/g/${gid}`;

  return (
    <div className="tabs">
      <div className="tabs-in">
        {TABS.map(([slug, label]) => {
          const href = slug ? `${base}/${slug}` : base;
          const active = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className="tab"
              aria-current={active ? 'page' : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
