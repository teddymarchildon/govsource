'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '../utils/supabase/client';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
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

type AuthProviderProps = {
  children: ReactNode;
  initialSession?: Session | null;
};

type Subscription = {
  id: string;
  user_id: string;
  status: string;
  current_period_end?: string;
  created_at?: string;
  [key: string]: any;
};

export function AuthProvider({ children, initialSession }: AuthProviderProps) {
  const [user, setUser] = useState<AppUser | null>(
    initialSession?.user
      ? {
          id: initialSession.user.id,
          email: initialSession.user.email ?? '',
          email_confirmed_at: (initialSession.user as any).email_confirmed_at ?? null,
          confirmed_at: (initialSession.user as any).confirmed_at ?? null,
        }
      : null
  );
  const [loading, setLoading] = useState(!initialSession);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [isPaidSubscriber, setIsPaidSubscriber] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const checkOnboardingStatus = async (userId: string): Promise<boolean> => {
    const supabase = createClient();
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
      const supabase = createClient();
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
    // Only check session on client if not hydrated from SSR
    if (!user) {
      const checkSession = async () => {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.auth.getSession();
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
            await checkOnboardingStatus(appUser.id);
            await checkSubscriptionStatus(appUser.id);
          }
        } catch (err) {
          console.error('[AuthProvider] checkSession error:', err);
        }
        setLoading(false);
      };
      checkSession();
    } else {
      // If user is already set from SSR, fetch onboarding/subscription
      checkOnboardingStatus(user.id);
      checkSubscriptionStatus(user.id);
      setLoading(false);
    }
    const supabase = createClient();
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
    const supabase = createClient();
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
    const supabase = createClient();
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
    const supabase = createClient();
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
