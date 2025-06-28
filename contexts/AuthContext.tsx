'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../utils/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';
import type { User as AppUser } from '../types/types';

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  signInWithMagicLink: (email: string, redirectUrl?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isPaidSubscriber: boolean;
  subscription: any | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaidSubscriber, setIsPaidSubscriber] = useState(false);
  const [subscription, setSubscription] = useState<any | null>(null);

  // Check if the user is a paid subscriber
  const checkSubscriptionStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('subscription')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      setSubscription(data || null);
      if (data) {
        const tier = data.tier;
        setIsPaidSubscriber(tier === 'paid');
      } else {
        setIsPaidSubscriber(false);
      }
    } catch (err) {
      setIsPaidSubscriber(false);
      setSubscription(null);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setTimeout(async () => {
          if (session?.user) {
            const supaUser = session.user as SupabaseUser;
            setUser({
              id: supaUser.id,
              email: supaUser.email ?? '',
              email_confirmed_at: (supaUser as any).email_confirmed_at ?? null,
              confirmed_at: (supaUser as any).confirmed_at ?? null,
            });
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
              await checkSubscriptionStatus(supaUser.id);
            }
          } else {
            setUser(null);
            setIsPaidSubscriber(false);
            setSubscription(null);
          }
          setLoading(false);
        }, 0);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string, redirectUrl?: string) => {
    console.log('signInWithMagicLink', email, redirectUrl);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl || (process.env.NEXT_PUBLIC_DOMAIN_BASE + '/onboarding')
      }
    });
    if (error) throw error;
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
      signInWithMagicLink,
      signOut,
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