'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // The access_token cookie is httpOnly, so it's never visible to
    // document.cookie - session state must come from AuthProvider's
    // server-verified /api/auth/me check instead.
    if (isLoading) return;
    router.push(user ? '/dashboard' : '/login');
  }, [user, isLoading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground text-sm animate-pulse">Loading Concentrate Portal...</p>
      </div>
    </div>
  );
}
