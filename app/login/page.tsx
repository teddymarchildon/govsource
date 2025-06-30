'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/contexts/OnboardingContext';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Google SVG icon
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#clip0_1313_1016)">
      <path d="M19.8052 10.2309C19.8052 9.55082 19.7491 8.86727 19.629 8.19727H10.2V12.0491H15.6263C15.3982 13.2855 14.6554 14.3673 13.6018 15.0482V17.3155H16.6018C18.4018 15.6682 19.8052 13.2309 19.8052 10.2309Z" fill="#4285F4"/>
      <path d="M10.2 20C12.7 20 14.8018 19.1836 16.6018 17.3155L13.6018 15.0482C12.6018 15.7482 11.4018 16.1491 10.2 16.1491C7.80181 16.1491 5.80181 14.4982 5.04818 12.2982H2.04818V14.6327C3.89818 17.8327 6.89818 20 10.2 20Z" fill="#34A853"/>
      <path d="M5.04818 12.2982C4.60181 11.0618 4.60181 9.73818 5.04818 8.50182V6.16727H2.04818C0.748181 8.66818 0.748181 11.7318 2.04818 14.6327L5.04818 12.2982Z" fill="#FBBC05"/>
      <path d="M10.2 3.85091C11.5018 3.83091 12.7518 4.29818 13.7018 5.16727L16.6682 2.20091C14.8018 0.498182 12.3018 -0.183637 10.2 0.00090909C6.89818 0.00090909 3.89818 2.16727 2.04818 5.36727L5.04818 7.70182C5.80181 5.50182 7.80181 3.85091 10.2 3.85091Z" fill="#EA4335"/>
    </g>
    <defs>
      <clipPath id="clip0_1313_1016">
        <rect width="20" height="20" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

function LoginPageInner() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';
  const { signInWithMagicLink, signInWithGoogle, user, loading: isAuthLoading } = useAuth();
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
      // Construct the absolute redirect URL
      const redirectUrl = typeof window !== 'undefined'
        ? window.location.origin + (redirectPath || '/')
        : undefined;
      await signInWithMagicLink(email, redirectUrl);
      setShowConfirmNotice(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);
    try {
      const redirectUrl = typeof window !== 'undefined'
        ? window.location.origin + (redirectPath || '/')
        : undefined;
      await signInWithGoogle(redirectUrl);
      // The user will be redirected by Supabase, so no further action needed here
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
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
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <div className="mt-1">
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full"
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Button
                    type="submit"
                    className="flex w-full justify-center"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Sending link...' : 'Send link'}
                  </Button>
                </div>
              </form>

              {/* Divider with OR */}
              <div className="flex items-center my-6">
                <div className="flex-grow border-t border-gray-300" />
                <span className="mx-4 text-gray-500 font-small">or</span>
                <div className="flex-grow border-t border-gray-300" />
              </div>

              {/* Google Sign-In Button */}
              <Button
                type="button"
                className="flex w-full justify-center items-center"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                <span className="mr-2 flex items-center"><GoogleIcon /></span>
                {isLoading ? 'Redirecting...' : 'Continue with Google'}
              </Button>
            </>
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
