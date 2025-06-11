'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import type { User as AppUser } from '../types/types';
import { createFreeSubscription } from '../services/api';

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  hasCompletedOnboarding: boolean;
  checkOnboardingStatus: (userId: string) => Promise<boolean>;
  isPaidSubscriber: boolean;
  subscription: any | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [isPaidSubscriber, setIsPaidSubscriber] = useState(false);
  const [subscription, setSubscription] = useState<any | null>(null);

  const checkOnboardingStatus = async (userId: string): Promise<boolean> => {
    if (!userId) return false;
    try {
      const { data, error } = await supabase
        .from('user_usage')
        .select('saw_onboarding_flow_at')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking onboarding status:', error);
        return false;
      }

      const completed = !!(data && data.saw_onboarding_flow_at);
      setHasCompletedOnboarding(completed);
      return completed;
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      return false;
    }
  };

  const checkSubscriptionStatus = async (userId: string) => {
    if (!userId) {
      setIsPaidSubscriber(false);
      setSubscription(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('subscription')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(data || null);

      if (data) {
        const status = data.status;
        const currentPeriodEnd = data.current_period_end ? new Date(data.current_period_end) : null;
        const now = new Date();
        const isActive =
          (status === 'active' || status === 'trialing') &&
          (!currentPeriodEnd || currentPeriodEnd > now);
        setIsPaidSubscriber(isActive);
      } else {
        setIsPaidSubscriber(false);
      }
    } catch (err) {
      setIsPaidSubscriber(false);
      setSubscription(null);
    }
  };

  useEffect(() => {
    // Check for active session on mount
    const checkSession = async () => {
      console.log('[AuthProvider] checkSession start');
      try {
        const { data, error } = await supabase.auth.getSession();
        console.log('[AuthProvider] getSession result:', { data, error });
        if (error) {
          console.error('Error checking auth session:', error);
        }
        if (data?.session) {
          const supaUser = data.session.user as SupabaseUser;
          const appUser = {
            id: supaUser.id,
            email: supaUser.email ?? '',
            email_confirmed_at: (supaUser as any).email_confirmed_at ?? null,
            confirmed_at: (supaUser as any).confirmed_at ?? null,
          };
          setUser(appUser);
          // Fetch onboarding and subscription status after user is set
          await checkOnboardingStatus(appUser.id);
          await checkSubscriptionStatus(appUser.id);
        }
      } catch (err) {
        console.error('[AuthProvider] checkSession error:', err);
      }
      setLoading(false);
      console.log('[AuthProvider] setLoading(false) called');
    };

    checkSession();

    // Set up auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const supaUser = session.user as SupabaseUser;
          const appUser = {
            id: supaUser.id,
            email: supaUser.email ?? '',
            email_confirmed_at: (supaUser as any).email_confirmed_at ?? null,
            confirmed_at: (supaUser as any).confirmed_at ?? null,
          };
          setUser(appUser);
          // Always fetch onboarding and subscription after user is set
          await checkOnboardingStatus(appUser.id);
          await checkSubscriptionStatus(appUser.id);
        } else {
          setUser(null);
          setIsPaidSubscriber(false);
          setSubscription(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) throw error;

    if (data?.user) {
      const supaUser = data.user as SupabaseUser;
      const appUser = {
        id: supaUser.id,
        email: supaUser.email ?? '',
        email_confirmed_at: (supaUser as any).email_confirmed_at ?? null,
        confirmed_at: (supaUser as any).confirmed_at ?? null,
      };
      setUser(appUser);
      await checkOnboardingStatus(appUser.id);
      await checkSubscriptionStatus(appUser.id);
    }
  };

  const signUp = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://govsrc.com/onboarding'
      }
    });
    setLoading(false);
    if (error) throw error;

    // New users haven't completed onboarding
    setHasCompletedOnboarding(false);
    setIsPaidSubscriber(false);
    setSubscription(null);

    // Create free subscription row if user is available
    if (data?.user?.id) {
      try {
        await createFreeSubscription(data.user.id);
      } catch (subErr) {
        // Optionally log or handle subscription creation error
        console.error('Failed to create free subscription:', subErr);
      }
    }
  };

  const signOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) throw error;
    setIsPaidSubscriber(false);
    setSubscription(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signOut,
      signUp,
      hasCompletedOnboarding,
      checkOnboardingStatus: () => user ? checkOnboardingStatus(user.id) : Promise.resolve(false),
      isPaidSubscriber,
      subscription
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
