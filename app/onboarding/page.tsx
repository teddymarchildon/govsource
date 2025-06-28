'use client';

import { useEffect, Suspense, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import OnboardingContainer from '../../components/onboarding/OnboardingContainer';
import { upsertSubscription } from '../../services/api';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { getLoginUrl } from '@/utils/utils';

function OnboardingContent() {
  const { user, loading, isPaidSubscriber } = useAuth();
  const router = useRouter();
  const hasAttemptedSubscriptionCreation = useRef(false);
  const pathname = usePathname();

  // Upsert free subscription for users when they land on onboarding
  useEffect(() => {
    const upsertSubscriptionForUser = async () => {
      if (!user || loading || hasAttemptedSubscriptionCreation.current) return;

      // Mark that we've attempted to create a subscription
      hasAttemptedSubscriptionCreation.current = true;
      try {
        if (!isPaidSubscriber) {
          await upsertSubscription(user.id);
        }
      } catch (error) {
        console.error('Error upserting free subscription:', error);
      }
    };

    upsertSubscriptionForUser();
  }, [user, loading]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push(getLoginUrl(pathname));
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    }>
      <OnboardingProvider>
        <OnboardingContent />
      </OnboardingProvider>
    </Suspense>
  );
}
