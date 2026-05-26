'use server';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_EMAIL, getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

type RankedItemType = 'bill' | 'law' | 'agency_document' | 'cluster' | 'executive_order';

interface RankedItemRow {
  id: number;
  created_at: string;
  updated_at: string;
  item_type: RankedItemType;
  item_id: number;
  rank: number;
  effectively_ranked_at: string | null;
  ranking_ended_at: string | null;
}

interface ResolvedItemSummary {
  title: string;
  subtitle: string | null;
  href: string;
}

type RankedItemWithSummary = RankedItemRow & {
  item: ResolvedItemSummary | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for ranked item admin');
}

const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const RankedItemTypeSchema = z.enum(['bill', 'law', 'agency_document', 'cluster', 'executive_order']);

const CreateRankedItemSchema = z.object({
  itemType: RankedItemTypeSchema,
  itemId: z.coerce.number().int().positive(),
  rank: z.coerce.number().int().min(1).max(10000),
  effectivelyRankedAt: z.string().datetime().nullable().optional(),
  rankingEndedAt: z.string().datetime().nullable().optional(),
});

const UpdateRankedItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  updates: z
    .object({
      itemType: RankedItemTypeSchema.optional(),
      itemId: z.coerce.number().int().positive().optional(),
      rank: z.coerce.number().int().min(1).max(10000).optional(),
      effectivelyRankedAt: z.string().datetime().nullable().optional(),
      rankingEndedAt: z.string().datetime().nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Updates cannot be empty',
      path: ['updates'],
    }),
});

function formatBillLabel(item: {
  title: string | null;
  type: string | null;
  number: string | number | null;
  congress: number | null;
}) {
  const labels: string[] = [];
  if (item.type && item.number) {
    labels.push(`${item.type.toUpperCase()} ${item.number}`);
  } else if (item.type) {
    labels.push(item.type.toUpperCase());
  } else if (item.number) {
    labels.push(String(item.number));
  }
  if (item.congress) {
    labels.push(`Congress ${item.congress}`);
  }
  return labels.join(' • ');
}

function normalizeDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function hydrateRankedRows(rows: RankedItemRow[]): Promise<RankedItemWithSummary[]> {
  const itemSummaries = await resolveItemSummaries(rows);
  return rows.map((row) => ({
    ...row,
    item: itemSummaries.get(`${row.item_type}:${row.item_id}`) ?? null,
  }));
}

async function validateRankedItemTarget(itemType: RankedItemType, itemId: number): Promise<string | null> {
  if (itemType === 'bill' || itemType === 'law') {
    const { data, error } = await supabaseAdmin
      .from('bill')
      .select('id, law_enacted_date')
      .eq('id', itemId)
      .maybeSingle();

    if (error) {
      console.error('[ranked-item-admin] Failed to validate bill target', error);
      return 'Could not validate bill target';
    }
    if (!data) return `${itemType === 'law' ? 'Law' : 'Bill'} #${itemId} does not exist`;
    if (itemType === 'bill' && data.law_enacted_date) return `Bill #${itemId} is an enacted law. Add it as a Law instead.`;
    if (itemType === 'law' && !data.law_enacted_date) return `Bill #${itemId} is not an enacted law yet. Add it as a Bill instead.`;
    return null;
  }

  if (itemType === 'agency_document' || itemType === 'executive_order') {
    const { data, error } = await supabaseAdmin
      .from('agency_document')
      .select('id, subtype')
      .eq('id', itemId)
      .maybeSingle();

    if (error) {
      console.error('[ranked-item-admin] Failed to validate agency document target', error);
      return 'Could not validate agency document target';
    }
    if (!data) return `${itemType === 'executive_order' ? 'Executive Order' : 'Agency document'} #${itemId} does not exist`;
    const isExecutiveOrder = data.subtype === 'Executive Order';
    if (itemType === 'executive_order' && !isExecutiveOrder) {
      return `Agency document #${itemId} is not an Executive Order`;
    }
    if (itemType === 'agency_document' && isExecutiveOrder) {
      return `Agency document #${itemId} is an Executive Order. Add it as an Executive Order instead.`;
    }
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('cluster')
    .select('id')
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    console.error('[ranked-item-admin] Failed to validate cluster target', error);
    return 'Could not validate Supreme Court case target';
  }
  return data ? null : `Supreme Court case #${itemId} does not exist`;
}

async function validateNoActiveDuplicate(itemType: RankedItemType, itemId: number, currentRowId?: number): Promise<string | null> {
  let query = supabaseAdmin
    .from('ranked_item')
    .select('id')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .is('ranking_ended_at', null)
    .limit(1);

  if (currentRowId) {
    query = query.neq('id', currentRowId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[ranked-item-admin] Failed to check duplicate ranked item', error);
    return 'Could not check for duplicate active rankings';
  }
  return data && data.length > 0 ? 'This item is already active in Popular now' : null;
}

async function resolveItemSummaries(rows: RankedItemRow[]) {
  const billIds = new Set<number>();
  const agencyDocumentIds = new Set<number>();
  const clusterIds = new Set<number>();

  rows.forEach((row) => {
    if (row.item_type === 'bill' || row.item_type === 'law') {
      billIds.add(row.item_id);
    } else if (row.item_type === 'agency_document' || row.item_type === 'executive_order') {
      agencyDocumentIds.add(row.item_id);
    } else if (row.item_type === 'cluster') {
      clusterIds.add(row.item_id);
    }
  });

  const [billResp, agencyResp, clusterResp] = await Promise.all([
    billIds.size
      ? supabaseAdmin
          .from('bill')
          .select('id, title, type, number, congress, law_title, law_number')
          .in('id', Array.from(billIds))
      : Promise.resolve({ data: [], error: null }),
    agencyDocumentIds.size
      ? supabaseAdmin
          .from('agency_document')
          .select('id, title, subtype, remote_document_number, president')
          .in('id', Array.from(agencyDocumentIds))
      : Promise.resolve({ data: [], error: null }),
    clusterIds.size
      ? supabaseAdmin
          .from('cluster')
          .select('id, case_name, case_name_short, slug')
          .in('id', Array.from(clusterIds))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (billResp.error) {
    console.error('[ranked-item-admin] Failed to fetch bill summaries', billResp.error);
  }
  if (agencyResp.error) {
    console.error('[ranked-item-admin] Failed to fetch agency document summaries', agencyResp.error);
  }
  if (clusterResp.error) {
    console.error('[ranked-item-admin] Failed to fetch cluster summaries', clusterResp.error);
  }

  const billById = new Map(
    (billResp.data ?? []).map((item) => [
      Number(item.id),
      {
        title: item.title,
        type: item.type,
        number: item.number,
        congress: item.congress,
        law_title: item.law_title,
        law_number: item.law_number,
      },
    ]),
  );
  const agencyById = new Map(
    (agencyResp.data ?? []).map((item) => [
      Number(item.id),
      {
        title: item.title,
        subtype: item.subtype,
        remote_document_number: item.remote_document_number,
        president: item.president,
      },
    ]),
  );
  const clusterById = new Map(
    (clusterResp.data ?? []).map((item) => [
      Number(item.id),
      {
        case_name: item.case_name,
        case_name_short: item.case_name_short,
        slug: item.slug,
      },
    ]),
  );

  const resolved = new Map<string, ResolvedItemSummary>();

  rows.forEach((row) => {
    const key = `${row.item_type}:${row.item_id}`;

    if (row.item_type === 'bill' || row.item_type === 'law') {
      const bill = billById.get(row.item_id);
      if (!bill) {
        resolved.set(key, {
          title: `Missing ${row.item_type} #${row.item_id}`,
          subtitle: null,
          href: row.item_type === 'law' ? `/laws/${row.item_id}` : `/bills/${row.item_id}`,
        });
        return;
      }

      if (row.item_type === 'law') {
        resolved.set(key, {
          title: bill.law_title || bill.title || `Law ${bill.law_number ?? row.item_id}`,
          subtitle: bill.law_number ? `Law ${bill.law_number}` : formatBillLabel(bill),
          href: `/laws/${row.item_id}`,
        });
        return;
      }

      resolved.set(key, {
        title: bill.title || `Bill ${row.item_id}`,
        subtitle: formatBillLabel(bill) || null,
        href: `/bills/${row.item_id}`,
      });
      return;
    }

    if (row.item_type === 'agency_document' || row.item_type === 'executive_order') {
      const document = agencyById.get(row.item_id);
      if (!document) {
        resolved.set(key, {
          title: `Missing ${row.item_type} #${row.item_id}`,
          subtitle: null,
          href: row.item_type === 'executive_order' ? `/executive-orders/${row.item_id}` : `/agency-rules/${row.item_id}`,
        });
        return;
      }

      if (row.item_type === 'executive_order') {
        const title = document.title || `Executive Order ${document.remote_document_number ?? row.item_id}`;
        const subtitle = [document.remote_document_number ? `#${document.remote_document_number}` : null, document.president]
          .filter(Boolean)
          .join(' • ');
        resolved.set(key, {
          title,
          subtitle: subtitle || null,
          href: `/executive-orders/${row.item_id}`,
        });
        return;
      }

      resolved.set(key, {
        title: document.title || `Agency Rule ${row.item_id}`,
        subtitle: document.subtype || null,
        href: `/agency-rules/${row.item_id}`,
      });
      return;
    }

    const cluster = clusterById.get(row.item_id);
    resolved.set(key, {
      title: cluster?.case_name || cluster?.case_name_short || `Case ${row.item_id}`,
      subtitle: cluster?.slug || null,
      href: `/supreme-court-cases/${row.item_id}`,
    });
  });

  return resolved;
}

export async function GET() {
  try {
    const { user, isAdmin } = await getCurrentUserAndAdminStatus();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isAdmin) {
      return NextResponse.json({ error: `Admin access required (${ADMIN_EMAIL})` }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('ranked_item')
      .select('id, created_at, updated_at, item_type, item_id, rank, effectively_ranked_at, ranking_ended_at')
      .order('rank', { ascending: true })
      .limit(250);

    if (error) {
      console.error('[ranked-item-admin] Failed to fetch ranked items', error);
      return NextResponse.json({ error: 'Failed to fetch ranked items' }, { status: 500 });
    }

    const rows = (data ?? []) as RankedItemRow[];
    const withSummary = await hydrateRankedRows(rows);

    const active = withSummary
      .filter((row) => row.ranking_ended_at === null)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

    const ended = withSummary
      .filter((row) => row.ranking_ended_at !== null)
      .sort((a, b) => {
        const aEnded = a.ranking_ended_at ? new Date(a.ranking_ended_at).getTime() : 0;
        const bEnded = b.ranking_ended_at ? new Date(b.ranking_ended_at).getTime() : 0;
        return bEnded - aEnded;
      });

    return NextResponse.json(
      {
        active,
        ended,
        notes: {
          homepageSelection: 'Homepage selects rows where ranking_ended_at is null and effectively_ranked_at is blank or in the past, then orders by rank asc and takes top 8.',
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[ranked-item-admin] Unexpected GET error', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch ranked items';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, isAdmin } = await getCurrentUserAndAdminStatus();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isAdmin) {
      return NextResponse.json({ error: `Admin access required (${ADMIN_EMAIL})` }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = CreateRankedItemSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const values = parsed.data;
    const targetError = await validateRankedItemTarget(values.itemType, values.itemId);
    if (targetError) {
      return NextResponse.json({ error: targetError }, { status: 400 });
    }
    const duplicateError = await validateNoActiveDuplicate(values.itemType, values.itemId);
    if (duplicateError) {
      return NextResponse.json({ error: duplicateError }, { status: 409 });
    }

    const now = new Date().toISOString();
    const insertValues = {
      item_type: values.itemType,
      item_id: values.itemId,
      rank: values.rank,
      effectively_ranked_at: normalizeDate(values.effectivelyRankedAt) ?? now,
      ranking_ended_at: normalizeDate(values.rankingEndedAt) ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('ranked_item')
      .insert(insertValues)
      .select('id, created_at, updated_at, item_type, item_id, rank, effectively_ranked_at, ranking_ended_at')
      .single();

    if (error || !data) {
      console.error('[ranked-item-admin] Failed to create ranked item', error);
      return NextResponse.json({ error: 'Failed to create ranked item' }, { status: 500 });
    }

    const [rankedItem] = await hydrateRankedRows([data as RankedItemRow]);
    return NextResponse.json({ rankedItem }, { status: 201 });
  } catch (error) {
    console.error('[ranked-item-admin] Unexpected POST error', error);
    const message = error instanceof Error ? error.message : 'Failed to create ranked item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, isAdmin } = await getCurrentUserAndAdminStatus();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isAdmin) {
      return NextResponse.json({ error: `Admin access required (${ADMIN_EMAIL})` }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = UpdateRankedItemSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { id, updates } = parsed.data;
    const { data: currentRow, error: currentError } = await supabaseAdmin
      .from('ranked_item')
      .select('id, item_type, item_id, ranking_ended_at')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      console.error('[ranked-item-admin] Failed to fetch current ranked item', currentError);
      return NextResponse.json({ error: 'Failed to fetch ranked item' }, { status: 500 });
    }
    if (!currentRow) {
      return NextResponse.json({ error: 'Ranked item not found' }, { status: 404 });
    }

    const nextItemType = updates.itemType ?? (currentRow.item_type as RankedItemType);
    const nextItemId = updates.itemId ?? Number(currentRow.item_id);
    const willBeActive = updates.rankingEndedAt === null || (updates.rankingEndedAt === undefined && currentRow.ranking_ended_at === null);

    if (updates.itemType !== undefined || updates.itemId !== undefined) {
      const targetError = await validateRankedItemTarget(nextItemType, nextItemId);
      if (targetError) {
        return NextResponse.json({ error: targetError }, { status: 400 });
      }
    }
    if (willBeActive) {
      const duplicateError = await validateNoActiveDuplicate(nextItemType, nextItemId, id);
      if (duplicateError) {
        return NextResponse.json({ error: duplicateError }, { status: 409 });
      }
    }

    const normalizedUpdates: Record<string, unknown> = {};
    if (updates.itemType !== undefined) normalizedUpdates.item_type = updates.itemType;
    if (updates.itemId !== undefined) normalizedUpdates.item_id = updates.itemId;
    if (updates.rank !== undefined) normalizedUpdates.rank = updates.rank;
    if (updates.effectivelyRankedAt !== undefined) {
      normalizedUpdates.effectively_ranked_at = normalizeDate(updates.effectivelyRankedAt);
    }
    if (updates.rankingEndedAt !== undefined) {
      normalizedUpdates.ranking_ended_at = normalizeDate(updates.rankingEndedAt);
    }
    normalizedUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('ranked_item')
      .update(normalizedUpdates)
      .eq('id', id)
      .select('id, created_at, updated_at, item_type, item_id, rank, effectively_ranked_at, ranking_ended_at')
      .single();

    if (error || !data) {
      console.error('[ranked-item-admin] Failed to update ranked item', error);
      return NextResponse.json({ error: 'Failed to update ranked item' }, { status: 500 });
    }

    const [rankedItem] = await hydrateRankedRows([data as RankedItemRow]);
    return NextResponse.json({ rankedItem }, { status: 200 });
  } catch (error) {
    console.error('[ranked-item-admin] Unexpected PATCH error', error);
    const message = error instanceof Error ? error.message : 'Failed to update ranked item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
