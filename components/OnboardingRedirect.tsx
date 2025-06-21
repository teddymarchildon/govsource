'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useOnboarding } from '../contexts/OnboardingContext';
import LoadingSpinner from './LoadingSpinner';

interface OnboardingRedirectProps {
  children: React.ReactNode;
}

export default function OnboardingRedirect({ children }: OnboardingRedirectProps) {
  const { userPreferences, isLoading } = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // If we're not loading, and onboarding is not completed, and we're not on the onboarding or login page
    if (!isLoading && !userPreferences.onboarding_completed && pathname !== '/onboarding' && pathname !== '/login') {
      router.push('/onboarding');
    }
  }, [isLoading, userPreferences.onboarding_completed, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // If on a page other than onboarding/login and onboarding is not complete, show loading spinner while redirecting
  if (pathname !== '/onboarding' && pathname !== '/login' && !userPreferences.onboarding_completed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
