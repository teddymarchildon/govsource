import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import { createAdminClient } from '@/utils/supabase/admin';

const Settings = z.object({
  publication_enabled: z.boolean(),
  daily_publication_limit: z.number().int().min(0).max(1000),
  daily_budget_usd: z.number().finite().min(0).max(1000),
}).strict();

async function authorized() {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  return Boolean(user && isAdmin);
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const db = createAdminClient();
  const jobId = new URL(request.url).searchParams.get('job');
  if (jobId) {
    if (!/^\d+$/.test(jobId)) return NextResponse.json({ error: 'Invalid job' }, { status: 400 });
    const { data, error } = await db.from('brief_attempt')
      .select('id,created_at,draft,verification,passed,prompt_version,writer_model,verifier_model')
      .eq('job_id', jobId).order('id', { ascending: false }).limit(3);
    if (error) return NextResponse.json({ error: 'Could not load verification history' }, { status: 500 });
    return NextResponse.json({ attempts: data }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const { data, error } = await db.rpc('brief_pipeline_overview');
  if (error) {
    console.error('[brief-pipeline] Overview failed', error);
    return NextResponse.json({ error: 'Pipeline unavailable. Check the database migration and source workflows.' }, { status: 503 });
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const input = Settings.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Enter valid publication and spending limits.' }, { status: 400 });
  const { error } = await createAdminClient().from('brief_pipeline_settings')
    .update({ ...input.data, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) return NextResponse.json({ error: 'Could not save pipeline settings' }, { status: 500 });
  return NextResponse.json({ saved: true });
}
