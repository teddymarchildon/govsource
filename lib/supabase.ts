import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
console.log('createClient', process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // Log the stack trace
  if (typeof window === 'undefined') {
    // Only log stack trace on the server
    console.log('createClient called on the server. Stack trace:\n', new Error().stack);
  } else {
    console.log('createClient called on the client.');
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
