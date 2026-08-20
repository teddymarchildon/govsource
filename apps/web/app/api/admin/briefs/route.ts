import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import { createAdminClient } from '@/utils/supabase/admin';

function getAdminClient() {
  return createAdminClient();
}

const BriefPointSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  text: z.string().trim().max(900),
  source_refs: z.array(z.string().min(1).max(80)).default([]),
});

const BriefSourceSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(160),
  url: z.string().url().max(2000),
});

const BriefInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().max(180).nullable().optional(),
  dek: z.string().trim().max(360).nullable().optional(),
  points: z.array(BriefPointSchema).max(5).default([]),
  context_markdown: z.string().max(12000).nullable().optional(),
  primary_item_type: z.enum(['bill', 'law', 'agency_document', 'executive_order', 'cluster']),
  primary_item_id: z.number().int().positive(),
  policy_areas: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  sources: z.array(BriefSourceSchema).max(20).default([]),
  author_name: z.string().trim().max(160).nullable().optional(),
  editor_notes: z.string().max(12000).nullable().optional(),
  status: z.enum(['draft', 'review', 'scheduled', 'published', 'archived']).default('draft'),
  published_at: z.string().datetime().nullable().optional(),
  is_featured: z.boolean().default(false),
  featured_until: z.string().datetime().nullable().optional(),
});

const CreateBriefSchema = BriefInputSchema;
const UpdateBriefSchema = BriefInputSchema.extend({
  id: z.number().int().positive(),
  version: z.number().int().positive(),
});

const BRIEF_LIST_FIELDS =
  'id,created_at,updated_at,version,status,title,slug,dek,points,primary_item_type,primary_item_id,policy_areas,sources,author_name,published_at,is_featured,featured_until,auto_generated';
const BRIEF_DETAIL_FIELDS = `${BRIEF_LIST_FIELDS},context_markdown,editor_notes`;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeInput(input: z.infer<typeof BriefInputSchema>) {
  const points = input.points
    .map((point, index) => ({
      id: point.id || `point_${index + 1}`,
      text: point.text.trim(),
      source_refs: [...new Set(point.source_refs)],
    }))
    .filter((point) => point.text.length > 0);
  const sources = input.sources.map((source, index) => ({
    id: source.id || `source_${index + 1}`,
    label: source.label.trim(),
    url: source.url,
  }));
  const publishing = input.status === 'published' || input.status === 'scheduled';
  const publishedAt = publishing
    ? input.published_at || new Date().toISOString()
    : input.published_at || null;
  const slug = cleanNullable(input.slug) || (publishing ? slugify(input.title) : null);

  if (publishing && points.length < 3) {
    throw new Error('Published and scheduled Briefs require between 3 and 5 points.');
  }
  if (publishing && !cleanNullable(input.dek)) {
    throw new Error('Published and scheduled Briefs require a dek.');
  }
  if (publishing && !slug) {
    throw new Error('Published and scheduled Briefs require a slug.');
  }
  if (input.status === 'scheduled' && (!publishedAt || new Date(publishedAt).getTime() <= Date.now())) {
    throw new Error('Scheduled Briefs require a future publication time.');
  }

  return {
    title: input.title.trim(),
    slug,
    dek: cleanNullable(input.dek),
    points,
    context_markdown: cleanNullable(input.context_markdown),
    primary_item_type: input.primary_item_type,
    primary_item_id: input.primary_item_id,
    policy_areas: [...new Set(input.policy_areas.map((area) => area.trim()).filter(Boolean))],
    sources,
    author_name: cleanNullable(input.author_name),
    editor_notes: cleanNullable(input.editor_notes),
    status: input.status,
    published_at: publishedAt,
    is_featured: input.is_featured,
    featured_until: input.is_featured ? input.featured_until || null : null,
    auto_generated: false,
  };
}

async function requireAdmin() {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!isAdmin) return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  return { user };
}

async function primaryItemExists(type: z.infer<typeof BriefInputSchema>['primary_item_type'], id: number) {
  if (type === 'bill' || type === 'law') {
    let query = getAdminClient().from('bill').select('id,law_enacted_date').eq('id', id);
    query = type === 'law' ? query.not('law_enacted_date', 'is', null) : query.is('law_enacted_date', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  if (type === 'agency_document' || type === 'executive_order') {
    const { data, error } = await getAdminClient()
      .from('agency_document')
      .select('id,subtype')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    return type === 'executive_order' ? data.subtype === 'Executive Order' : data.subtype !== 'Executive Order';
  }

  const { data, error } = await getAdminClient().from('cluster').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const id = Number(params.get('id'));
  if (params.has('id')) {
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid Brief id' }, { status: 400 });
    }
    const { data, error } = await getAdminClient()
      .from('brief')
      .select(BRIEF_DETAIL_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Failed to load Brief' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    return NextResponse.json({ brief: data });
  }

  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit') || '25', 10) || 25));
  const from = (page - 1) * limit;
  let query = getAdminClient()
    .from('brief')
    .select(BRIEF_LIST_FIELDS, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, from + limit - 1);

  const status = params.get('status');
  const itemType = params.get('primaryItemType');
  const search = params.get('search')?.trim();
  if (status && status !== 'all') query = query.eq('status', status);
  if (itemType && itemType !== 'all') query = query.eq('primary_item_type', itemType);
  if (search) {
    const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
    query = query.or(`title.ilike.%${escaped}%,dek.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[brief-admin] Failed to load Briefs', error);
    return NextResponse.json({ error: 'Failed to load Briefs' }, { status: 500 });
  }

  return NextResponse.json({
    briefs: data ?? [],
    pagination: { page, perPage: limit, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const parsed = CreateBriefSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid Brief' }, { status: 400 });
  }

  try {
    if (!(await primaryItemExists(parsed.data.primary_item_type, parsed.data.primary_item_id))) {
      return NextResponse.json({ error: 'The selected government record does not exist or has the wrong type.' }, { status: 400 });
    }
    const payload = normalizeInput(parsed.data);
    const { data, error } = await getAdminClient()
      .from('brief')
      .insert({ ...payload, created_by: auth.user.id, updated_by: auth.user.id })
      .select(BRIEF_DETAIL_FIELDS)
      .single();
    if (error) {
      console.error('[brief-admin] Failed to create Brief', error);
      const duplicate = error.code === '23505';
      return NextResponse.json({ error: duplicate ? 'That slug is already in use.' : 'Failed to create Brief' }, { status: duplicate ? 409 : 500 });
    }
    return NextResponse.json({ brief: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Brief';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const parsed = UpdateBriefSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid Brief' }, { status: 400 });
  }

  try {
    if (!(await primaryItemExists(parsed.data.primary_item_type, parsed.data.primary_item_id))) {
      return NextResponse.json({ error: 'The selected government record does not exist or has the wrong type.' }, { status: 400 });
    }
    const { id, version, ...input } = parsed.data;
    const payload = normalizeInput(input);
    const { data, error } = await getAdminClient()
      .from('brief')
      .update({ ...payload, updated_by: auth.user.id })
      .eq('id', id)
      .eq('version', version)
      .select(BRIEF_DETAIL_FIELDS)
      .maybeSingle();
    if (error) {
      console.error('[brief-admin] Failed to update Brief', error);
      const duplicate = error.code === '23505';
      return NextResponse.json({ error: duplicate ? 'That slug is already in use.' : 'Failed to update Brief' }, { status: duplicate ? 409 : 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'This Brief changed in another session. Reload it before saving.' }, { status: 409 });
    }
    return NextResponse.json({ brief: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Brief';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
