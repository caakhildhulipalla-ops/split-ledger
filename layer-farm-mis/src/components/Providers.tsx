'use client';

import { useEffect, type ReactNode } from 'react';
import { DataProvider } from '@/lib/store';
import { initNative } from '@/lib/native';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initNative();
  }, []);

  return <DataProvider>{children}</DataProvider>;
}
