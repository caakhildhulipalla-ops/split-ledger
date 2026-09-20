'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './ui';
import { usePermissions } from '@/lib/hooks';

interface Tab {
  href: string;
  label: string;
  icon: (p: { size?: number }) => React.ReactElement;
  /** Supervisors get a shorter bar: no money, no masters. */
  supervisor: boolean;
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Icon.dashboard, supervisor: false },
  { href: '/entry',     label: 'Entry',     icon: Icon.entry,     supervisor: true },
  { href: '/feed',      label: 'Feed',      icon: Icon.feed,      supervisor: true },
  { href: '/money',     label: 'Money',     icon: Icon.money,     supervisor: false },
  { href: '/more',      label: 'More',      icon: Icon.more,      supervisor: true },
];

export function Nav() {
  const pathname = usePathname();
  const { role } = usePermissions();
  const tabs = role === 'supervisor' ? TABS.filter((t) => t.supervisor) : TABS;

  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}>
              <tab.icon size={22} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
