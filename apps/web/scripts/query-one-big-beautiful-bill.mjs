/**
 * One-off script to query the bill table for "One Big Beautiful Bill".
 * Run from govlens-frontend with: node scripts/query-one-big-beautiful-bill.mjs
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set in .env.local or env.');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from('bill')
  .select('*')
  .ilike('title', '%One Big Beautiful Bill%');

if (error) {
  console.error('Query error:', error);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
console.log('\nCount:', data?.length ?? 0);
