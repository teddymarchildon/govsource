import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function getCurrentUserAndAdminStatus(): Promise<{
  user: User | null;
  isAdmin: boolean;
}> {
  const authClient = await createClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return { user: null, isAdmin: false };

  // Read membership on every request so removal takes effect without a new JWT.
  // Never fall back to an email allowlist or user-editable profile metadata.
  try {
    const { data, error } = await createAdminClient()
      .from('admin_user').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error) {
      console.error('[admin-auth] Could not verify admin membership', error.code);
      return { user, isAdmin: false };
    }
    return { user, isAdmin: Boolean(data) };
  } catch {
    console.error('[admin-auth] Admin membership lookup unavailable');
    return { user, isAdmin: false };
  }
}
