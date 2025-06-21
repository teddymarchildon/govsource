'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

interface OnboardingRedirectProps {
  children: React.ReactNode;
}

export default function OnboardingRedirect({ children }: OnboardingRedirectProps) {
  const { user, loading: authLoading } = useAuth();
  const { userPreferences, isLoading: onboardingLoading } = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirect if a user is logged in but hasn't completed onboarding
    const shouldRedirect = !authLoading && user && !onboardingLoading && !userPreferences.onboarding_completed;

    if (shouldRedirect && pathname !== '/onboarding' && pathname !== '/login') {
      router.push('/onboarding');
    }
  }, [authLoading, user, onboardingLoading, userPreferences.onboarding_completed, pathname, router]);

  // The page is loading if either auth or onboarding state is loading
  const isLoading = authLoading || onboardingLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // If a logged-in user hasn't completed onboarding, show a spinner while redirecting
  // This prevents flashing the page content before the redirect happens
  if (user && !userPreferences.onboarding_completed && pathname !== '/onboarding' && pathname !== '/login') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
