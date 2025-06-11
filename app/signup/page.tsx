'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { createClient } from '../../lib/supabase';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signUp, user } = useAuth();
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const pathname = usePathname();
  const supabase = createClient();
  // Password strength state
  const [passwordStrength, setPasswordStrength] = useState<{score: number, label: string, colorClass: string}>({score: 0, label: '', colorClass: ''});

  // Password strength algorithm
  function getPasswordStrength(pw: string) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    // Score: 0-5
    if (pw.length === 0) return {score: 0, label: '', colorClass: ''};
    if (score <= 2) return {score, label: 'Weak', colorClass: 'bg-red-500 text-red-600'};
    if (score === 3 || score === 4) return {score, label: 'Medium', colorClass: 'bg-yellow-400 text-yellow-700'};
    return {score, label: 'Strong', colorClass: 'bg-green-500 text-green-700'};
  }

  useEffect(() => {
    setPasswordStrength(getPasswordStrength(password));
  }, [password]);

  useEffect(() => {
    if (user && user.email_confirmed_at) {
      router.push('/onboarding');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await signUp(email, password);
      setShowConfirmNotice(true);
      // Do not redirect to onboarding until email is confirmed
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  // Poll for email confirmation every 5 seconds when waiting for confirmation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (showConfirmNotice && user && !user.confirmed_at) {
      interval = setInterval(async () => {
        // Refetch the user from Supabase
        const { data, error } = await supabase.auth.getUser();
        if (data?.user?.email_confirmed_at) {
          // Optionally, you can update the AuthContext user here if needed
          window.location.reload(); // Reload to trigger redirect
        }
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showConfirmNotice, user]);

  if (user && user.email_confirmed_at) {
    // Optionally, render nothing or a loading spinner while redirecting
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Create an Account</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {showConfirmNotice && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
            Please check your email and click the confirmation link to activate your account.
          </div>
        )}

        {!showConfirmNotice && (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
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

            <div className="mb-4">
              <label htmlFor="password" className="block text-gray-700 font-medium mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
              {/* Password strength meter */}
              {password && (
                <div className="mt-2">
                  <div className="w-full h-2 rounded bg-gray-200">
                    <div
                      className={`h-2 rounded ${
                        passwordStrength.label === 'Weak' ? 'bg-red-500' : passwordStrength.label === 'Medium' ? 'bg-yellow-400' : passwordStrength.label === 'Strong' ? 'bg-green-500' : ''
                      }`}
                      style={{ width: `${(passwordStrength.score/5)*100}%`, transition: 'width 0.3s' }}
                    ></div>
                  </div>
                  <div className={`text-xs mt-1 font-medium ${
                    passwordStrength.label === 'Weak' ? 'text-red-600' : passwordStrength.label === 'Medium' ? 'text-yellow-700' : passwordStrength.label === 'Strong' ? 'text-green-700' : ''
                  }`}>{passwordStrength.label}</div>
                </div>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-gray-700 font-medium mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-700 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <p>
            Already have an account?{' '}
            <Link href={`/login?redirect=${encodeURIComponent(pathname)}`} className="text-blue-700 hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
