'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/contexts/OnboardingContext';
import LoadingIndicator from '@/components/ui/LoadingIndicator';

function LoginPageInner() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';
  const { signInWithMagicLink, user, loading: isAuthLoading } = useAuth();
  const { userPreferences, isLoading: isOnboardingLoading } = useOnboarding();

  // Redirect if user is already logged in
  useEffect(() => {
    // Wait for auth and onboarding states to be loaded
    if (!isAuthLoading && user && !isOnboardingLoading) {
      if (!userPreferences.onboarding_completed) {
        // Redirect to onboarding, preserving the original redirect path
        const onboardingUrl = `/onboarding${redirectPath !== '/' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`;
        router.push(onboardingUrl);
      } else {
        // Onboarding is complete, redirect to the originally intended path or homepage
        router.push(redirectPath);
      }
    }
  }, [user, isAuthLoading, userPreferences.onboarding_completed, isOnboardingLoading, router, redirectPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithMagicLink(email);
      setShowConfirmNotice(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send link');
    } finally {
      setIsLoading(false);
    }
  };

  if (user && user.email_confirmed_at) {
    // Optionally, render nothing or a loading spinner while redirecting
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 pt-20">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Stay informed about government activity
          </p>
        </div>
        <div className="bg-white py-8 px-4 shadow-md sm:rounded-lg sm:px-10">
          <div className="mb-6 text-center">
            <h3 className="text-xl font-bold text-gray-900">Welcome</h3>
            <p className="text-sm text-gray-600">Enter your email to access your account</p>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {showConfirmNotice && (
            <div className="bg-secondary border border-primary/20 text-secondary-foreground px-4 py-3 rounded mb-4">
              Check your email for a link to sign in. Click the link to continue back to GovSource.
            </div>
          )}

          {!showConfirmNotice && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="mt-1">
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-primary focus:outline-none focus:ring-primary sm:text-sm"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="flex w-full justify-center rounded-md border border-transparent bg-primary py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending link...' : 'Send link'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <LoadingIndicator size="large" />
    </div>}>
      <OnboardingProvider>
        <LoginPageInner />
      </OnboardingProvider>
    </Suspense>
  );
}
