import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import { createAdminClient } from '@/utils/supabase/admin';

const Input = z.union([
  z.object({ briefId: z.number().int().positive().safe() }).strict(),
  z.object({ url: z.string().trim().max(2048) }).strict(),
]);
const routes: Record<string, string> = {
  bills: 'bill', laws: 'bill', 'agency-rules': 'agency_document',
  'executive-orders': 'agency_document', 'supreme-court-cases': 'cluster',
};

export async function POST(request: Request) {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user || !isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Choose a brief or paste a GovSource document link.' }, { status: 400 });
  const db = createAdminClient();
  let type: string | undefined, id: number | undefined, briefId: number | null = null;
  if ('briefId' in input.data) {
    const { data, error } = await db.from('brief').select('id,primary_item_type,primary_item_id').eq('id', input.data.briefId).maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load the selected brief.' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Brief not found.' }, { status: 404 });
    type = data.primary_item_type === 'law' ? 'bill' : data.primary_item_type === 'executive_order' ? 'agency_document' : data.primary_item_type;
    id = Number(data.primary_item_id); briefId = Number(data.id);
  } else {
    try {
      const url = new URL(input.data.url, 'https://www.govsrc.com');
      if (!['www.govsrc.com', 'govsrc.com'].includes(url.hostname) || !['https:', 'http:'].includes(url.protocol) || url.port || url.username || url.password) throw new Error();
      const match = /^\/([^/]+)\/([1-9]\d*)\/?$/.exec(url.pathname);
      if (!match || !routes[match[1]]) throw new Error();
      type = routes[match[1]]; id = Number(match[2]);
    } catch {
      return NextResponse.json({ error: 'Paste a GovSource bill, law, agency rule, executive order, or Supreme Court case link.' }, { status: 400 });
    }
  }
  if (!type || !['bill', 'agency_document', 'cluster'].includes(type) || !Number.isSafeInteger(id) || !id || id < 1) {
    return NextResponse.json({ error: 'This source is not supported here. For campaign finance, use Draft a contribution overview.' }, { status: 400 });
  }
  const { data, error } = await db.rpc('request_brief_generation', { p_type: type, p_id: id, p_user: user.id, p_brief: briefId });
  if (error) {
    console.error('[brief-requests] Request failed', error);
    return NextResponse.json({ error: error.message === 'Source record not found' ? 'Source record not found.' : 'Could not queue this request. Please try again.' }, { status: error.message === 'Source record not found' ? 404 : 500 });
  }
  return NextResponse.json({ requestId: data }, { status: 202 });
}

export async function GET() {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user || !isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const db = createAdminClient();
  const { data: requests, error } = await db.from('brief_generation_request').select('id,source_type,item_id,original_brief_id,created_at,status,error').order('id', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: 'Could not load generation requests.' }, { status: 503 });
  if (!requests?.length) return NextResponse.json({ requests: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const { data: jobs, error: jobError } = await db.from('brief_job').select('manual_request_id,status,reason,last_error,brief_id,next_attempt_at,source_metadata').in('manual_request_id', requests.map(row => row.id));
  if (jobError) return NextResponse.json({ error: 'Could not load generation progress.' }, { status: 503 });
  return NextResponse.json({ requests: requests.map(row => {
    const job = jobs?.find(job => job.manual_request_id === row.id);
    return { ...row, job: job ? { status: job.status, reason: job.reason, last_error: job.last_error, brief_id: job.brief_id, next_attempt_at: job.next_attempt_at, title: job.source_metadata?.title || job.source_metadata?.case_name } : null };
  }) }, { headers: { 'Cache-Control': 'no-store' } });
}
