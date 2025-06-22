'use client';

import { useEffect, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import OnboardingContainer from '../../components/onboarding/OnboardingContainer';
import { upsertFreeSubscription } from '../../services/api';
import { OnboardingProvider } from '@/contexts/OnboardingContext';

function OnboardingContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const hasAttemptedSubscriptionCreation = useRef(false);

  // Upsert free subscription for users when they land on onboarding
  useEffect(() => {
    const upsertSubscriptionForUser = async () => {
      if (!user || loading || hasAttemptedSubscriptionCreation.current) return;

      // Mark that we've attempted to create a subscription
      hasAttemptedSubscriptionCreation.current = true;
      
      try {
        await upsertFreeSubscription(user.id);
      } catch (error) {
        console.error('Error upserting free subscription:', error);
      }
    };

    upsertSubscriptionForUser();
  }, [user, loading]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    }>
      <OnboardingProvider>
        <OnboardingContent />
      </OnboardingProvider>
    </Suspense>
  );
}
