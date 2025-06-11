import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('[supabase.ts] URL:', supabaseUrl, 'KEY:', supabaseKey ? 'set' : 'NOT SET');

export const supabase = createBrowserClient(supabaseUrl, supabaseKey);
