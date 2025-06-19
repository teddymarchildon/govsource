'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { OnboardingProvider } from '../../contexts/OnboardingContext';
import OnboardingContainer from '../../components/onboarding/OnboardingContainer';
import { createFreeSubscription } from '../../services/api';
import { supabase } from '../../utils/supabase/client';

function OnboardingContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Create free subscription for new users when they land on onboarding with newUser=true
  useEffect(() => {
    const createSubscriptionForNewUser = async () => {
      if (!user || loading) return;

      // Check if this is a new user signup (has newUser=true query param)
      const isNewUser = searchParams.get('newUser') === 'true';
      
      try {
        // Check if user already has a subscription
        const { data: existingSubscription, error: checkError } = await supabase
          .from('subscription')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (checkError) {
          console.error('Error checking existing subscription:', checkError);
          return;
        }

        // If no subscription exists, create a free one
        if (!existingSubscription && isNewUser) {
          await createFreeSubscription(user.id);
          console.log('Created free subscription for new user:', user.id);
        }
      } catch (error) {
        console.error('Error creating free subscription:', error);
      }
    };

    createSubscriptionForNewUser();
  }, [user, loading, searchParams]);

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
    <OnboardingProvider>
      <OnboardingContainer />
    </OnboardingProvider>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
