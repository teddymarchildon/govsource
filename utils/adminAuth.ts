import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export const ADMIN_EMAIL = 'ted.marchildon@gmail.com';

function normalizeEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined) {
  return normalizeEmail(email) === ADMIN_EMAIL;
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
