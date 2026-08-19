import { supabase } from '@/utils/supabase/client';
import type { Subscription } from '@/types/types';

type UserUsage = {
  id: string;
  user_id: string;
  ai_interactions: number;
  saw_onboarding_flow_at?: string | null;
};

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscription')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Subscription | null;
}

export async function upsertSubscription() {
  const response = await fetch('/api/upsert-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Failed to initialize subscription');
  }
}

export async function createCheckoutSession() {
  const response = await fetch('/api/create-checkout-session', { method: 'POST' });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Failed to create checkout session');
  }

  const session = await response.json();
  return session.url as string;
}

export async function upsertUserUsage(userId: string) {
  const { data, error } = await supabase
    .from('user_usage')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });

  if (error) throw error;
  return data;
}

export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  const { data, error } = await supabase
    .from('user_usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as UserUsage | null;
}

