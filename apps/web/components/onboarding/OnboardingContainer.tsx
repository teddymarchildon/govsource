'use client';

import { useOnboarding } from '../../contexts/OnboardingContext';
import StateSelection from './StateSelection';
import PolicyAreaSelection from './PolicyAreaSelection';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeAuthRedirect } from '@/utils/authRedirect';
import LoadingIndicator from '../ui/LoadingIndicator';

export default function OnboardingContainer() {
  const { currentStep, totalSteps, isLoading, skipOnboarding, userPreferences } = useOnboarding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeAuthRedirect(searchParams.get('redirect'));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && userPreferences.onboarding_completed) {
      router.replace(destination);
    }
  }, [isLoading, userPreferences.onboarding_completed, router, destination]);

  if (isLoading || (userPreferences && userPreferences.onboarding_completed)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingIndicator size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm py-4 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">GovSource Onboarding</h1>
          <button
            onClick={async () => {
              setError('');
              try { await skipOnboarding(); } catch { setError('Unable to skip onboarding. Please try again.'); }
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            Skip
          </button>
        </div>
      </header>

      {error && <p role="alert" className="px-6 pt-4 text-destructive">{error}</p>}
      <main className="flex-grow flex flex-col items-center justify-center py-12">
        <div className="w-full max-w-4xl">
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="p-4 bg-primary text-primary-foreground">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="h-2 bg-black/20 rounded-full">
                    <div
                      className="h-2 bg-white rounded-full"
                      style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <span className="ml-4 text-sm font-medium">
                  Step {currentStep} of {totalSteps}
                </span>
              </div>
            </div>

            <div className="p-6">
              {currentStep === 1 && <StateSelection />}
              {currentStep === 2 && <PolicyAreaSelection />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
