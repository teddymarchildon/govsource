'use client';

import LoadingIndicator from '@/components/ui/LoadingIndicator';

import { useEffect, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import OnboardingContainer from '../../components/onboarding/OnboardingContainer';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { getLoginUrl } from '@/utils/utils';

function OnboardingContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push(getLoginUrl(pathname));
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingIndicator size="large" />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
      <OnboardingContainer />
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <LoadingIndicator size="large" />
      </div>
    }>
      <OnboardingProvider>
        <OnboardingContent />
      </OnboardingProvider>
    </Suspense>
  );
}
