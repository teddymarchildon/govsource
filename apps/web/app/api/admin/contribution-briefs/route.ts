import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import { createAdminClient } from '@/utils/supabase/admin';
import { getContributionOverview } from '@/lib/repositories/contributionOverview';
import { buildContributionBrief } from '@/lib/contributionBrief';

const Input = z.object({ memberId: z.number().int().positive(), cycle: z.number().int().min(1980).max(2200).refine(n => n % 2 === 0) });

export async function POST(request: Request) {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a member and a valid two-year reporting cycle.' }, { status: 400 });
  const { memberId, cycle } = parsed.data;
  const db = createAdminClient();
  const existing = () => db.from('brief').select('*').eq('primary_item_type', 'campaign_finance')
    .eq('primary_item_id', memberId).eq('contribution_cycle', cycle).maybeSingle();
  try {
    const found = await existing();
    if (found.error) throw found.error;
    if (found.data) return NextResponse.json({ brief: found.data, existing: true });
    const member = await db.from('congressman').select('id,full_name').eq('id', memberId).maybeSingle();
    if (member.error) throw member.error;
    if (!member.data) return NextResponse.json({ error: 'Congress member not found.' }, { status: 404 });
    const { committees, individuals } = await getContributionOverview(String(memberId), String(cycle));
    if (committees.cycle !== cycle) return NextResponse.json({ error: 'This reporting period has not been published yet.' }, { status: 422 });
    let draft;
    try { draft = buildContributionBrief(member.data, committees, individuals); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Coverage is insufficient.' }, { status: 422 }); }
    const { data, error } = await db.from('brief').insert({ ...draft, created_by: user.id, updated_by: user.id }).select('*').single();
    if (error?.code === '23505') {
      const concurrent = await existing();
      if (!concurrent.error && concurrent.data) return NextResponse.json({ brief: concurrent.data, existing: true });
    }
    if (error) throw error;
    return NextResponse.json({ brief: data, existing: false }, { status: 201 });
  } catch (error) {
    console.error('[contribution-brief] Generation failed', error);
    return NextResponse.json({ error: 'Could not create the contribution overview. Check data availability and try again.' }, { status: 500 });
  }
}
