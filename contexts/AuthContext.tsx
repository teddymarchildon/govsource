'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../utils/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';
import type { User as AppUser } from '../types/types';

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  hasCompletedOnboarding: boolean;
  checkOnboardingStatus: () => Promise<boolean>;
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

  const checkOnboardingStatus = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      // Check user_usage table for saw_onboarding_flow_at
      const { data, error } = await supabase
        .from('user_usage')
        .select('saw_onboarding_flow_at')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
        console.error('Error checking onboarding status:', error);
        return false;
      }

      // User has completed onboarding if saw_onboarding_flow_at is not null
      const completed = !!(data && data.saw_onboarding_flow_at);
      setHasCompletedOnboarding(completed);
      return completed;
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      return false;
    }
  };

  // Check if the user is a paid subscriber
  const checkSubscriptionStatus = async (userId: string) => {
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
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Error checking auth session:', error);
      }

      if (data?.session) {
        const supaUser = data.session.user as SupabaseUser;
        setUser({
          id: supaUser.id,
          email: supaUser.email ?? '',
          email_confirmed_at: (supaUser as any).email_confirmed_at ?? null,
          confirmed_at: (supaUser as any).confirmed_at ?? null,
        });
        // Check onboarding status when user is set
        await checkOnboardingStatus();
        await checkSubscriptionStatus(supaUser.id);
      }

      setLoading(false);
    };

    checkSession();

    // Set up auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const supaUser = session.user as SupabaseUser;
          setUser({
            id: supaUser.id,
            email: supaUser.email ?? '',
            email_confirmed_at: (supaUser as any).email_confirmed_at ?? null,
            confirmed_at: (supaUser as any).confirmed_at ?? null,
          });
          // Check onboarding status when auth state changes
          if (event === 'SIGNED_IN') {
            await checkOnboardingStatus();
          } else {
            await checkSubscriptionStatus(supaUser.id);
          }
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) throw error;

    // Check onboarding status after sign in
    await checkOnboardingStatus();
    if (user) await checkSubscriptionStatus(user.id);
  };

  const signUp = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
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
      checkOnboardingStatus,
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