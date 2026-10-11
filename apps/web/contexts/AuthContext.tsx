'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../utils/supabase/client';
import type { User as AppUser } from '../types/types';
import { upsertSubscription, upsertUserUsage, getUserUsage } from '../services/account';
import { authCallbackUrl } from '@/utils/authRedirect';
import { AI_FREE_USAGE_LIMIT } from '../constants/onboarding';

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  signInWithMagicLink: (email: string, redirectUrl?: string) => Promise<void>;
  signInWithPassword: (email: string, password: string, redirectUrl?: string) => Promise<void>;
  signUp: (email: string, password: string, redirectUrl?: string) => Promise<void>;
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

  useEffect(() => {
    let active = true;
    let generation = 0;
    let currentUserId: string | null = null;

    const resetAccount = () => {
      setIsPaidSubscriber(false);
      setSubscription(null);
      setAiInteractions(0);
      setAiLimitReached(false);
    };

    const loadAccount = async (userId: string, version: number) => {
      const isCurrent = () => active && version === generation;
      try {
        await upsertUserUsage(userId);
        if (!isCurrent()) return;
        const [{ data, error }, usage] = await Promise.all([
          supabase.from('subscription').select('*').eq('user_id', userId).maybeSingle(),
          getUserUsage(userId),
        ]);
        if (error) throw error;
        if (!isCurrent()) return;
        if (!data) await upsertSubscription();
        if (!isCurrent()) return;
        const paid = data?.tier === 'paid';
        const count = usage?.ai_interactions || 0;
        setSubscription(data || null);
        setIsPaidSubscriber(paid);
        setAiInteractions(count);
        setAiLimitReached(!paid && count >= AI_FREE_USAGE_LIMIT);
      } catch {
        if (isCurrent()) resetAccount();
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        const supaUser = session?.user;
        const userId = supaUser?.id ?? null;
        setUser(supaUser ? {
          id: supaUser.id,
          email: supaUser.email ?? '',
          email_confirmed_at: supaUser.email_confirmed_at ?? null,
          confirmed_at: supaUser.confirmed_at ?? null,
        } : null);
        // Account enrichment must not block sign-in or run inside the auth lock.
        setLoading(false);
        if (userId !== currentUserId) {
          currentUserId = userId;
          const version = ++generation;
          resetAccount();
          if (userId) setTimeout(() => {
            if (active && version === generation) void loadAccount(userId, version);
          }, 0);
        }
      }
    );

    return () => {
      active = false;
      generation++;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string, redirectUrl?: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: authCallbackUrl(window.location.origin, redirectUrl)
      }
    });
    if (error) throw error;
  };

  const signInWithPassword = async (email: string, password: string, _redirectUrl?: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, redirectUrl?: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authCallbackUrl(window.location.origin, redirectUrl)
      }
    });
    if (error) throw error;
  };

  const signInWithGoogle = async (redirectUrl?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authCallbackUrl(window.location.origin, redirectUrl)
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setIsPaidSubscriber(false);
      setSubscription(null);
      setAiInteractions(0);
      setAiLimitReached(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signInWithMagicLink,
      signInWithPassword,
      signUp,
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
