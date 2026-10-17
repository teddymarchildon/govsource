import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import { createAdminClient } from '@/utils/supabase/admin';
import { FRONT_PAGES, FRONT_PAGE_SLOTS } from '@/types/frontPage';

const id = z.string().regex(/^[1-9]\d*$/).nullable();
const Input = z.object({ section: z.enum(FRONT_PAGES), version: z.number().int().positive(),
  lead_brief_id: id, supporting_brief_id: id, secondary_brief_id: id }).strict();
const fields = 'section,version,lead_brief_id,supporting_brief_id,secondary_brief_id';

export async function GET() {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user || !isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const db = createAdminClient();
  const { data, error } = await db.from('brief_front_page').select(fields);
  if (error) return NextResponse.json({ error: 'Could not load front pages. Check that the front-page migration has been applied.' }, { status: 503 });
  const ids = [...new Set((data ?? []).flatMap(row => FRONT_PAGE_SLOTS.map(slot => row[slot])).filter(Boolean))];
  const result = ids.length ? await db.from('brief').select('id,title,slug,status,published_at,primary_item_type').in('id', ids) : { data: [], error: null };
  if (result.error) return NextResponse.json({ error: 'Could not load selected briefs.' }, { status: 500 });
  return NextResponse.json({ settings: data, briefs: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user || !isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid page and brief selection.' }, { status: 400 });
  const { section, version, ...slots } = parsed.data;
  const ids = Object.values(slots).filter((value): value is string => value !== null);
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Each brief can appear only once on a page.' }, { status: 400 });
  const db = createAdminClient();
  if (ids.length) {
    const { data, error } = await db.from('brief').select('id').in('id', ids)
      .in('status', ['published', 'scheduled']).not('slug', 'is', null)
      .not('published_at', 'is', null).lte('published_at', new Date().toISOString());
    if (error) return NextResponse.json({ error: 'Could not verify the selected briefs.' }, { status: 500 });
    if (data.length !== ids.length) return NextResponse.json({ error: 'Only currently published briefs can be highlighted. Remove or replace unavailable selections.' }, { status: 400 });
  }
  const { data, error } = await db.from('brief_front_page')
    .update({ ...slots, version: version + 1, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('section', section).eq('version', version).select(fields).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not save this page.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'This page changed in another session. Reload before saving.' }, { status: 409 });
  return NextResponse.json({ settings: data });
}
