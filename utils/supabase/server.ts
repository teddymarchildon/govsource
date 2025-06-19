import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create a single supabase client for server-side rendering
export const supabaseServer = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});