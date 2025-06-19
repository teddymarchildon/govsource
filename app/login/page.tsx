'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';

function LoginPageInner() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/profile';
  const { signInWithMagicLink, hasCompletedOnboarding, user, checkOnboardingStatus } = useAuth();

  // Check if user has completed onboarding when they're authenticated
  useEffect(() => {
    const checkAndRedirect = async () => {
      if (user) {
        // Re-check onboarding status to ensure it's up to date
        const completed = await checkOnboardingStatus();

        if (!completed) {
          // Redirect to onboarding, passing along the redirect param if present
          router.push(`/onboarding${redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`);
        } else {
          // Otherwise redirect to the original page or profile
          router.push(redirectPath);
        }
      }
    };

    if (user) {
      checkAndRedirect();
    }
  }, [user, hasCompletedOnboarding, checkOnboardingStatus, router, redirectPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithMagicLink(email);
      setShowConfirmNotice(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  if (user && user.email_confirmed_at) {
    // Optionally, render nothing or a loading spinner while redirecting
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign In</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {showConfirmNotice && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
            Check your email for a magic link to sign in. Click the link in your email to continue.
          </div>
        )}

        {!showConfirmNotice && (
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="email" className="block text-gray-700 font-medium mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-700 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Sending magic link...' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
