'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../utils/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';
import type { User as AppUser } from '../types/types';
import { upsertSubscription, upsertUserUsage, getUserUsage } from '../services/api';
import { AI_FREE_USAGE_LIMIT } from '../constants/onboarding';

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  signInWithMagicLink: (email: string, redirectUrl?: string) => Promise<void>;
  signInWithGoogle: (redirectUrl?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isPaidSubscriber: boolean;
  subscription: any | null;
  aiInteractions: number;
  aiLimitReached: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaidSubscriber, setIsPaidSubscriber] = useState(false);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [aiInteractions, setAiInteractions] = useState<number>(0);
  const [aiLimitReached, setAiLimitReached] = useState<boolean>(false);

  // Check if the user is a paid subscriber
  const handlePostLogin = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('subscription')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      setSubscription(data || null);
      let isPaid = false;
      if (data) {
        const tier = data.tier;
        isPaid = tier === 'paid';
        setIsPaidSubscriber(isPaid);
      } else {
        await upsertSubscription(userId);
        setIsPaidSubscriber(false);
      }
      // Fetch aiInteractions from user_usage
      const usage = await getUserUsage(userId);
      const count = usage?.ai_interactions || 0;
      setAiInteractions(count);
      setAiLimitReached(!isPaid && count >= AI_FREE_USAGE_LIMIT);
    } catch (err) {
      setIsPaidSubscriber(false);
      setSubscription(null);
      setAiInteractions(0);
      setAiLimitReached(false);
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
            if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && supaUser.id) {
              try {
                await upsertUserUsage(supaUser.id);
              } catch (err) {
                console.error('Error upserting user_usage or subscription:', err);
              }
              await handlePostLogin(supaUser.id);
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl || (process.env.NEXT_PUBLIC_DOMAIN_BASE + '/onboarding')
      }
    });
    if (error) throw error;
  };

  const signInWithGoogle = async (redirectUrl?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl || (process.env.NEXT_PUBLIC_DOMAIN_BASE + '/onboarding')
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
      signInWithGoogle,
      signOut,
      isPaidSubscriber,
      subscription,
      aiInteractions,
      aiLimitReached
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