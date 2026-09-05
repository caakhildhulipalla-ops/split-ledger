'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, FullScreenLoader } from '@/lib/auth';

/** Entry point: route to the group list or to sign-in once the session is known. */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/groups' : '/signin');
  }, [user, loading, router]);

  return <FullScreenLoader />;
}
