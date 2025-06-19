'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

interface OnboardingRedirectProps {
  children: React.ReactNode;
}

export default function OnboardingRedirect({ children }: OnboardingRedirectProps) {
  const { user, loading, hasCompletedOnboarding, checkOnboardingStatus } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!loading && user) {
        // Double-check onboarding status to make sure it's up to date
        const completed = await checkOnboardingStatus();
        if (!completed) {
          // Redirect to onboarding if saw_onboarding_flow_at is null
          router.push('/onboarding');
        }
      }
    };

    checkAndRedirect();
  }, [user, loading, hasCompletedOnboarding, checkOnboardingStatus, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // If user hasn't completed onboarding, don't render children
  // The useEffect will handle the redirect
  if (user && !hasCompletedOnboarding) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
