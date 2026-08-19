import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

function normalizeEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase();
}

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'ted.marchildon@gmail.com')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
);

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.has(normalizeEmail(email));
}

export async function getCurrentUserAndAdminStatus(): Promise<{
  user: User | null;
  isAdmin: boolean;
}> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  return {
    user,
    isAdmin: isAdminEmail(user?.email),
  };
}
