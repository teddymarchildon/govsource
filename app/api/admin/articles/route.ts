'use server'

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { fetchHtmlContent, processDocumentContent } from '@/utils/documentUtils';
import { ADMIN_EMAIL, getCurrentUserAndAdminStatus } from '@/utils/adminAuth';
import {
  Agent,
  run,
  tool,
  user as createUserMessage,
  type AgentInputItem,
} from '@openai/agents';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

type PrimaryItemType = 'bill' | 'law' | 'executive_order' | 'cluster';

interface ArticleContext {
  primaryItemType: PrimaryItemType;
  primaryItemId: number;
  siteUrl: string;
  metadata: Record<string, unknown>;
  documentSources: DocumentSource[];
}

interface GenerationResult {
  articleId: number;
  status: string;
  title: string;
  updated: boolean;
  wordCount: number;
}

const PROMPT_VERSION = 'v3';
const MODEL_NAME = 'gpt-4.1-mini';

const GenerateArticleSchema = z.object({
  primaryItemType: z.enum(['bill', 'law', 'executive_order', 'cluster']),
  primaryItemId: z.number().int().min(1),
});

const ArticleModelSchema = z.object({
  title: z.string().min(10).max(120),
  dek: z.string().min(1).max(220),
  summary: z.string().min(1).max(360),
  excerpt: z.string().min(1).max(240),
  body: z.object({
    paragraphs: z.array(z.string().min(1).max(800)).min(3).max(6),
  }),
  source_urls: z.array(z.string().url()).length(1),
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin article generation');
}
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required for admin article generation');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

interface DocumentSource {
  label: string;
  format: 'html' | 'text';
  bucket?: string;
  path?: string;
  content?: string;
}

interface DocumentChunk {
  content: string;
  index: number;
  sourceLabel: string;
}

const EMBEDDING_MODEL = 'text-embedding-3-small';

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitBySize(text: string, chunkSize: number, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('. ', end);
      const wordEnd = text.lastIndexOf(' ', end);
      if (sentenceEnd > start + chunkSize * 0.8) {
        end = sentenceEnd + 1;
      } else if (wordEnd > start + chunkSize * 0.8) {
        end = wordEnd;
      }
    }
    chunks.push(text.slice(start, Math.min(end, text.length)));
    start = Math.max(end - overlap, end);
  }
  return chunks;
}

function normalizePlainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function chunkContent(content: string, sourceLabel: string, startIndex: number, chunkSize = 3000) {
  const segments = splitBySize(content, chunkSize);
  const chunks: DocumentChunk[] = [];
  let index = startIndex;
  for (const segment of segments) {
    const normalized = normalizePlainText(segment);
    if (normalized.length === 0) continue;
    chunks.push({
      content: normalized,
      index,
      sourceLabel,
    });
    index += 1;
  }
  return { chunks, nextIndex: index };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    a2 += x * x;
    b2 += y * y;
  }
  if (a2 === 0 || b2 === 0) return 0;
  return dot / (Math.sqrt(a2) * Math.sqrt(b2));
}

function extractFinalText(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    const r: any = result as any;
    if (r && typeof r.output_text === 'string') return r.output_text;
    if (r && r.currentStep && typeof r.currentStep.output === 'string') return r.currentStep.output;
    const lmr = r?.lastModelResponse;
    if (lmr && Array.isArray(lmr.output)) {
      for (const item of lmr.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && c.type === 'output_text' && typeof c.text === 'string') return c.text;
          }
        }
      }
    }
    const seen = new Set<any>();
    const stack: any[] = [r];
    let depth = 0;
    while (stack.length && depth < 10000) {
      depth++;
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if ((node as any).type === 'output_text' && typeof (node as any).text === 'string') return (node as any).text;
      for (const v of Object.values(node)) {
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  } catch {}
  return typeof result === 'string' ? result : JSON.stringify(result);
}

async function resolveSourceContent(source: DocumentSource): Promise<string | null> {
  if (typeof source.content === 'string' && source.content.trim().length > 0) {
    return source.content;
  }
  if (source.bucket && source.path) {
    return await fetchHtmlContent(source.bucket, source.path);
  }
  return null;
}

async function buildChunksForSources(sources: DocumentSource[]): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];
  let nextIndex = 0;
  for (const source of sources) {
    const rawContent = await resolveSourceContent(source);
    if (!rawContent) continue;

    let baseText: string | null = null;
    if (source.format === 'html') {
      const processed = processDocumentContent(rawContent);
      baseText = processed ? cleanHtml(processed) : cleanHtml(rawContent);
    } else {
      baseText = normalizePlainText(rawContent);
    }

    if (!baseText || baseText.length === 0) continue;

    const prefixed = `${source.label}\n\n${baseText}`;
    const { chunks: sourceChunks, nextIndex: updated } = chunkContent(prefixed, source.label, nextIndex);
    chunks.push(...sourceChunks);
    nextIndex = updated;
  }
  return chunks;
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s/)
    .filter(Boolean).length;
}

function truncate(text: string | null | undefined, maxChars = 4000) {
  if (!text) return null;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Truncated: original content exceeded ${maxChars} characters.]`;
}

function buildSiteUrl(request: Request, path: string) {
  const requestUrl = new URL(request.url);
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `${requestUrl.protocol}//${requestUrl.host}`;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function convertBodyToMarkdown(body: z.infer<typeof ArticleModelSchema>['body']) {
  return body.paragraphs.map((paragraph) => paragraph.trim()).join('\n\n');
}

async function gatherBillOrLawContext(
  client: SupabaseClient,
  primaryItemId: number,
  isLaw: boolean
): Promise<ArticleContext | null> {
  const { data: bill, error } = await client
    .from('bill')
    .select(
      'id, title, type, number, congress, policy_area, introduced_date, law_enacted_date, law_number, law_title, law_type'
    )
    .eq('id', primaryItemId)
    .single();

  if (error || !bill) {
    console.error('[article-agent] Unable to fetch bill/law', error);
    return null;
  }

  if (isLaw && !bill.law_enacted_date) {
    return null;
  }

  const [{ data: summaryData }, { data: actionsData }, { data: sponsorData }] = await Promise.all([
    client
      .from('bill_summary')
      .select('text, date')
      .eq('bill', primaryItemId)
      .order('date', { ascending: false })
      .limit(1),
    client
      .from('bill_action')
      .select('date, text, type')
      .eq('bill_id', primaryItemId)
      .order('date', { ascending: false })
      .limit(5),
    client
      .from('sponsored_bills')
      .select('congressman:congressman(full_name, party, state, chamber)')
      .eq('bill_id', primaryItemId)
      .limit(1),
  ]);

  const { data: textRecords, error: textError } = await client
    .from('bill_text')
    .select('html_file_path, text_file_path, date')
    .eq('bill_id', primaryItemId)
    .order('date', { ascending: false })
    .limit(1);

  if (textError) {
    console.error('[article-agent] Unable to fetch bill text paths', textError);
  }

  const summaryText = summaryData && summaryData.length > 0 ? summaryData[0].text : null;
  const actionsText =
    actionsData && actionsData.length > 0
      ? actionsData
          .map((action) => {
            const date = action.date || 'Unknown date';
            return `${date}: ${action.text ?? ''}`.trim();
          })
          .join('\n')
      : null;

  const documentSources: DocumentSource[] = [];
  const latestTextRecord = textRecords?.[0] ?? null;
  if (latestTextRecord?.html_file_path) {
    documentSources.push({
      label: 'Official Document Text',
      format: 'html',
      bucket: 'bill-htmls',
      path: latestTextRecord.html_file_path,
    });
  }

  if (summaryText) {
    documentSources.push({
      label: 'Latest Official Summary',
      format: 'text',
      content: summaryText,
    });
  }

  if (actionsText) {
    documentSources.push({
      label: 'Recent Legislative Actions',
      format: 'text',
      content: actionsText,
    });
  }

  if (documentSources.length === 0) {
    return null;
  }

  const metadata = {
    title: bill.title,
    type: bill.type,
    number: bill.number,
    congress: bill.congress,
    policy_area: bill.policy_area,
    introduced_date: bill.introduced_date,
    law_enacted_date: bill.law_enacted_date,
    law_number: bill.law_number,
    law_title: bill.law_title,
    law_type: bill.law_type,
    sponsor: sponsorData && sponsorData.length > 0 ? sponsorData[0].congressman : null,
  };

  const siteUrl = isLaw ? `/laws/${primaryItemId}` : `/bills/${primaryItemId}`;

  return {
    primaryItemType: isLaw ? 'law' : 'bill',
    primaryItemId,
    siteUrl,
    metadata,
    documentSources,
  };
}

async function gatherExecutiveOrderContext(
  client: SupabaseClient,
  primaryItemId: number
): Promise<ArticleContext | null> {
  const { data: order, error } = await client
    .from('agency_document')
    .select(
      'id, title, abstract, type, subtype, remote_document_number, signing_date, publication_date, president, html_file_path'
    )
    .eq('id', primaryItemId)
    .single();

  if (error || !order) {
    console.error('[article-agent] Unable to fetch executive order', error);
    return null;
  }

  if (!order.abstract) {
    return null;
  }

  const { data: agenciesData } = await client
    .from('agency_agencydocument')
    .select('agency:agency(name, short_name)')
    .eq('agency_document_id', primaryItemId)
    .limit(3);

  const metadata = {
    title: order.title,
    remote_document_number: order.remote_document_number,
    signing_date: order.signing_date,
    publication_date: order.publication_date,
    president: order.president,
    agencies:
      agenciesData?.map((entry) => entry.agency).filter(Boolean) ??
      [],
  };

  return {
    primaryItemType: 'executive_order',
    primaryItemId,
    siteUrl: `/executive-orders/${primaryItemId}`,
    metadata,
    documentSources: [
      ...(order.html_file_path
        ? [
            {
              label: 'Executive Order Full Text',
              format: 'html' as const,
              bucket: 'agency-docs',
              path: order.html_file_path,
            },
          ]
        : []),
      {
        label: 'Executive Order Abstract',
        format: 'text',
        content: order.abstract,
      },
    ],
  };
}

async function downloadTextFromStorage(client: SupabaseClient, bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const normalisedPath = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
  try {
    const { data, error } = await client.storage.from(bucket).download(normalisedPath);
    if (error || !data) {
      console.warn('[article-agent] Unable to download text from storage', bucket, path, error);
      return null;
    }
    const text = await data.text();
    return truncate(text, 5000);
  } catch (storageError) {
    console.error('[article-agent] Storage download error', storageError);
    return null;
  }
}

async function gatherClusterContext(
  client: SupabaseClient,
  primaryItemId: number
): Promise<ArticleContext | null> {
  const { data: cluster, error } = await client
    .from('cluster')
    .select('id, case_name, case_name_short, slug, date_filed, court:court(full_name, short_name)')
    .eq('id', primaryItemId)
    .single();

  if (error || !cluster) {
    console.error('[article-agent] Unable to fetch cluster', error);
    return null;
  }

  const { data: opinions, error: opinionsError } = await client
    .from('court_opinion')
    .select('id, title, date, type, text_file_path, author:judge(full_name)')
    .eq('cluster_id', primaryItemId)
    .order('date', { ascending: false })
    .limit(2);

  if (opinionsError) {
    console.error('[article-agent] Unable to fetch opinions', opinionsError);
  }

  const textSections: Array<{ label: string; content: string }> = [];

  if (opinions && opinions.length > 0) {
    for (const opinion of opinions) {
      const text = await downloadTextFromStorage(client, 'opinions', opinion.text_file_path);
      if (text) {
        textSections.push({
          label: `Opinion: ${opinion.title ?? opinion.type ?? opinion.id}`,
          content: text,
        });
      }
    }
  }

  if (textSections.length === 0) {
    return null;
  }

  const metadata = {
    case_name: cluster.case_name,
    case_name_short: cluster.case_name_short,
    slug: cluster.slug,
    date_filed: cluster.date_filed,
    court: cluster.court,
    opinions: opinions?.map((opinion) => ({
      id: opinion.id,
      title: opinion.title,
      date: opinion.date,
      type: opinion.type,
      author: opinion.author,
    })),
  };

  return {
    primaryItemType: 'cluster',
    primaryItemId,
    siteUrl: `/supreme-court-cases/${primaryItemId}`,
    metadata,
    documentSources: textSections.map((section) => ({
      label: section.label,
      format: 'text' as const,
      content: section.content,
    })),
  };
}

async function gatherContext(
  client: SupabaseClient,
  primaryItemType: PrimaryItemType,
  primaryItemId: number
): Promise<ArticleContext | null> {
  switch (primaryItemType) {
    case 'bill':
      return gatherBillOrLawContext(client, primaryItemId, false);
    case 'law':
      return gatherBillOrLawContext(client, primaryItemId, true);
    case 'executive_order':
      return gatherExecutiveOrderContext(client, primaryItemId);
    case 'cluster':
      return gatherClusterContext(client, primaryItemId);
    default:
      return null;
  }
}

function composeArticleRecord(
  payload: z.infer<typeof ArticleModelSchema>,
  context: ArticleContext,
  promptTemplate: string,
  modelUsage: { inputTokens?: number | null; outputTokens?: number | null },
  wordCount: number
) {
  const now = new Date().toISOString();
  const bodyMarkdown = convertBodyToMarkdown(payload.body);

  return {
    title: payload.title,
    dek: payload.dek,
    summary: payload.summary,
    excerpt: payload.excerpt,
    body: payload.body,
    body_markdown: bodyMarkdown,
    source_urls: [context.siteUrl],
    auto_generated: true,
    prompt_template: promptTemplate,
    generation_metadata: {
      model: MODEL_NAME,
      prompt_version: PROMPT_VERSION,
      input_tokens: modelUsage.inputTokens ?? null,
      output_tokens: modelUsage.outputTokens ?? null,
      word_count: wordCount,
    },
    generated_at: now,
    status: 'draft',
    is_featured: false,
    primary_item_type: context.primaryItemType,
    primary_item_id: context.primaryItemId,
    author: 'GovLens Automated Writer',
    agent_identifier: 'govlens:article-agent:v3',
    reading_time: Math.max(1, Math.round(wordCount / 200)),
  };
}

async function insertOrUpdateArticle(record: ReturnType<typeof composeArticleRecord>) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('article')
    .select('id, auto_generated')
    .eq('primary_item_type', record.primary_item_type)
    .eq('primary_item_id', record.primary_item_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error('[article-agent] Unable to query existing article', existingError);
  }

  if (existing && existing.auto_generated) {
    const { data, error } = await supabaseAdmin
      .from('article')
      .update(record)
      .eq('id', existing.id)
      .select('id, title, status')
      .single();
    if (error || !data) {
      throw new Error('Failed to update existing article');
    }
    return { articleId: data.id, title: data.title, status: data.status, updated: true };
  }

  const { data, error } = await supabaseAdmin
    .from('article')
    .insert(record)
    .select('id, title, status')
    .single();

  if (error || !data) {
    console.error('[article-agent] Failed to insert article', error);
    throw new Error('Failed to insert article');
  }

  return { articleId: data.id, title: data.title, status: data.status, updated: false };
}

function computeTotalWordCount(payload: z.infer<typeof ArticleModelSchema>) {
  const summaryWords = countWords(payload.summary);
  const dekWords = countWords(payload.dek);
  const excerptWords = countWords(payload.excerpt);
  const bodyWords = payload.body.paragraphs.reduce((sum, paragraph) => sum + countWords(paragraph), 0);
  return summaryWords + dekWords + excerptWords + bodyWords;
}

const ARTICLE_BASE_FIELDS =
  'id,title,slug,status,summary,excerpt,dek,author,auto_generated,is_featured,featured_until,primary_item_type,primary_item_id,generated_at,published_at,updated_at,generation_metadata,prompt_template,agent_identifier,source_urls,views_count,clickthroughs,reading_time';

const ARTICLE_DETAIL_FIELDS = `${ARTICLE_BASE_FIELDS},body,body_markdown,editor_notes`;

function parseBooleanParam(value: string | null) {
  if (value === null) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function sanitizeLimit(value: string | null, fallback = 25) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) {
    return parsed;
  }
  return fallback;
}

export async function GET(request: Request) {
  try {
    const { user, isAdmin } = await getCurrentUserAndAdminStatus();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isAdmin) {
      return NextResponse.json({ error: `Admin access required (${ADMIN_EMAIL})` }, { status: 403 });
    }

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const articleIdParam = searchParams.get('id');

    if (articleIdParam) {
      const articleId = Number(articleIdParam);
      if (!Number.isFinite(articleId) || articleId <= 0) {
        return NextResponse.json({ error: 'Invalid article id' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('article')
        .select(ARTICLE_DETAIL_FIELDS)
        .eq('id', articleId)
        .maybeSingle();

      if (error) {
        console.error('[article-admin] Failed to fetch article detail', error);
        return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }

      return NextResponse.json({ article: data }, { status: 200 });
    }

    const status = searchParams.get('status');
    const primaryItemType = searchParams.get('primaryItemType');
    const searchTerm = searchParams.get('search');
    const autoGeneratedParam = parseBooleanParam(searchParams.get('autoGenerated'));
    const page = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const limit = sanitizeLimit(searchParams.get('limit'), 25);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const offset = (safePage - 1) * limit;
    const to = offset + limit - 1;

    let query = supabaseAdmin
      .from('article')
      .select(ARTICLE_BASE_FIELDS, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, to);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (primaryItemType && primaryItemType !== 'all') {
      query = query.eq('primary_item_type', primaryItemType);
    }
    if (autoGeneratedParam !== null) {
      query = query.eq('auto_generated', autoGeneratedParam);
    }
    if (searchTerm) {
      const sanitized = searchTerm.trim();
      if (sanitized.length > 0) {
        const escaped = sanitized.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.or(`title.ilike.%${escaped}%,summary.ilike.%${escaped}%`);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[article-admin] Failed to fetch articles', error);
      return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json(
      {
        articles: data ?? [],
        pagination: {
          page: safePage,
          perPage: limit,
          total,
          totalPages,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[article-admin] Unexpected error fetching articles', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch articles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const UpdateArticleSchema = z.object({
  id: z.number().int().min(1),
  updates: z
    .object({
      title: z.string().min(1).max(200).optional(),
      dek: z.string().min(1).max(240).optional(),
      summary: z.string().min(1).max(600).optional(),
      excerpt: z.string().min(1).max(400).optional(),
      status: z.enum(['draft', 'review', 'scheduled', 'published', 'archived']).optional(),
      slug: z.string().min(1).max(180).nullable().optional(),
      is_featured: z.boolean().optional(),
      featured_until: z.string().datetime().nullable().optional(),
      auto_generated: z.boolean().optional(),
      editor_notes: z.string().nullable().optional(),
      author: z.string().nullable().optional(),
      source_urls: z.array(z.string()).optional(),
      body_markdown: z.string().optional(),
      body: z.any().optional(),
      published_at: z.string().datetime().nullable().optional(),
      reading_time: z.number().int().min(0).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Updates cannot be empty',
      path: ['updates'],
    }),
});

function normalizeUpdatePayload(updates: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === 'featured_until' || key === 'published_at') {
      if (value === null) {
        normalized[key] = null;
      } else {
        const date = new Date(String(value));
        normalized[key] = Number.isNaN(date.getTime()) ? null : date.toISOString();
      }
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
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

    const body = await request.json();
    const parsed = UpdateArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { id, updates } = parsed.data;
    const normalizedUpdates = normalizeUpdatePayload(updates);
    const now = new Date().toISOString();

    if ('status' in updates) {
      const status = updates.status;
      if (status === 'published') {
        if (!('published_at' in normalizedUpdates) || !normalizedUpdates.published_at) {
          normalizedUpdates.published_at = now;
        }
      } else if (status !== 'scheduled') {
        if (!('published_at' in normalizedUpdates)) {
          normalizedUpdates.published_at = null;
        }
      }
    }

    if ('is_featured' in updates && updates.is_featured === false) {
      if (!('featured_until' in normalizedUpdates)) {
        normalizedUpdates.featured_until = null;
      }
    }

    normalizedUpdates.updated_at = now;

    const { data, error } = await supabaseAdmin
      .from('article')
      .update(normalizedUpdates)
      .eq('id', id)
      .select(ARTICLE_DETAIL_FIELDS)
      .single();

    if (error || !data) {
      console.error('[article-admin] Failed to update article', error);
      return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
    }

    return NextResponse.json({ article: data }, { status: 200 });
  } catch (error) {
    console.error('[article-admin] Unexpected error updating article', error);
    const message = error instanceof Error ? error.message : 'Failed to update article';
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

    const body = await request.json();
    const parsedRequest = GenerateArticleSchema.safeParse(body);
    if (!parsedRequest.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { primaryItemType, primaryItemId } = parsedRequest.data;
    const context = await gatherContext(supabaseAdmin, primaryItemType, primaryItemId);
    if (!context) {
      return NextResponse.json({ error: 'Unable to gather article context' }, { status: 404 });
    }

    const siteUrl = buildSiteUrl(request, context.siteUrl);
    const documentChunks = await buildChunksForSources(context.documentSources);
    if (documentChunks.length === 0) {
      return NextResponse.json({ error: 'No document content available' }, { status: 404 });
    }

    const embeddingsResp = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: documentChunks.map((chunk) => chunk.content),
    });
    const chunkEmbeddings: number[][] = embeddingsResp.data.map((item) => item.embedding);

    const searchRelevantSections = tool({
      name: 'search_relevant_sections',
      description: 'Return top relevant sections by semantic similarity. Use before fetching content.',
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(8).nullable(),
      }),
      execute: async (input) => {
        const { query, limit } = input as { query: string; limit: number | null };
        const q = typeof query === 'string' ? query : '';
        const k = typeof limit === 'number' && !Number.isNaN(limit) ? limit : 5;
        const qEmbedResp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: q });
        const qVec = qEmbedResp.data[0].embedding;
        const scored = chunkEmbeddings.map((vec, i) => ({
          id: i,
          score: cosineSimilarity(qVec, vec),
        }));
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, k).map((s) => ({
          id: s.id,
          score: s.score,
          source: documentChunks[s.id].sourceLabel,
          preview: documentChunks[s.id].content.slice(0, 400),
        }));
        return JSON.stringify(top);
      },
    });

    const fetchMoreContent = tool({
      name: 'fetch_more_content',
      description:
        'Fetch full text for specific sections by ids or a fuzzy query. Returns ordered excerpts labeled as [Section N | Source: name].',
      parameters: z.object({
        chunk_ids: z.array(z.number()).nullable(),
        section_query: z.string().nullable(),
        max_sections: z.number().int().min(1).max(8).nullable(),
      }),
      execute: async (input) => {
        const { chunk_ids, section_query, max_sections } = input as {
          chunk_ids: number[] | null;
          section_query: string | null;
          max_sections: number | null;
        };
        const max = typeof max_sections === 'number' && !Number.isNaN(max_sections) ? max_sections : 6;
        let selected: DocumentChunk[] = [];
        if (Array.isArray(chunk_ids) && chunk_ids.length > 0) {
          selected = chunk_ids
            .map((id) => documentChunks[id])
            .filter(Boolean)
            .slice(0, max)
            .sort((a, b) => a.index - b.index);
        } else if (typeof section_query === 'string' && section_query.trim().length > 0) {
          const q = section_query.toLowerCase();
          const terms = q.split(/\s+/).filter(Boolean);
          const scored = documentChunks.map((chunk) => ({
            chunk,
            score: terms.reduce((acc, term) => {
              const matches = chunk.content.toLowerCase().match(new RegExp(term, 'gi')) || [];
              return acc + matches.length;
            }, 0),
          }));
          scored.sort((a, b) => b.score - a.score);
          selected = scored
            .slice(0, max)
            .map((entry) => entry.chunk)
            .sort((a, b) => a.index - b.index);
        }
        if (selected.length === 0) return 'No matching sections found.';
        let text = `Extracted sections for article drafting:\n\n`;
        selected.forEach((chunk, idx) => {
          text += `[Section ${idx + 1} | Source: ${chunk.sourceLabel}]\n${chunk.content}\n\n`;
          if (idx < selected.length - 1) text += '---\n\n';
        });
        text += '\nEach section corresponds to the original document passage shown above.';
        return text;
      },
    });

    const getDocumentMetadata = tool({
      name: 'get_document_metadata',
      description: 'Return structured metadata for the primary item.',
      parameters: z.object({}),
      execute: async () =>
        JSON.stringify({
          primaryItemType: context.primaryItemType,
          primaryItemId: context.primaryItemId,
          siteUrl,
          metadata: context.metadata,
          sources: context.documentSources.map((source) => source.label),
        }),
    });

    const metadataSummary = JSON.stringify(context.metadata ?? {}, null, 2);
    const sourcesSummary = context.documentSources.map((source) => `- ${source.label}`).join('\n');

    const systemInstructions = [
      `You are GovLens' editorial agent. Your job is to draft a concise, factual briefing article grounded strictly in the provided primary source documents.`,
      `Primary item type: ${context.primaryItemType}. Canonical GovLens URL: ${siteUrl}.`,
      `Metadata:\n${metadataSummary}`,
      sourcesSummary ? `Available sources:\n${sourcesSummary}` : 'Available sources: (metadata only)',
      [
        'Workflow rules:',
        '1. Call search_relevant_sections before fetch_more_content to locate key passages.',
        '2. Gather only the passages you will cite. Do not guess or rely on memory.',
        '3. Cite supporting evidence inline using [Section N] after the relevant sentence.',
        '4. If key context is missing, state what is unavailable rather than speculating.',
      ].join('\n'),
      [
        'Writing guidelines:',
        '- Adopt a neutral, newsroom-style voice suitable for policy professionals.',
        '- Produce 3–5 short paragraphs of narrative prose (no lists) that flow logically from the event to its implications.',
        '- When the item is a bill or law, name the primary sponsor and their party (and state if available).',
        '- When the item is an executive order, name the president who signed it.',
        '- Use citations like [Section N] in the body wherever facts rely on fetched passages.',
        '- Keep the overall word count at or below 200 words; keep dek and summary tight.',
        '- Each paragraph should cover one idea (about 2–4 sentences).',
      ].join('\n'),
      [
        'Output requirements:',
        '- Return valid JSON with keys: title, dek, summary, excerpt, body.paragraphs, source_urls.',
        '- body.paragraphs must be an array of 3–6 paragraphs in publication order.',
        '- source_urls must contain exactly one item: the canonical GovLens URL.',
        '- Do not include any text outside the JSON object.',
        '- Example JSON structure:',
        '  {"title":"...","dek":"...","summary":"...","excerpt":"...","body":{"paragraphs":["Paragraph [Section 1] ...","Paragraph [Section 2] ...","Paragraph [Section 3] ..."]},"source_urls":["https://example.com"]}',
      ].join('\n'),
    ].join('\n\n');

    const agent = new Agent({
      name: 'ArticleAuthor',
      instructions: systemInstructions,
      tools: [searchRelevantSections, fetchMoreContent, getDocumentMetadata],
      model: MODEL_NAME,
    });

    const initialMessage = [
      `Draft the GovLens article for ${context.metadata?.title ?? 'the referenced item'}.`,
      'Follow the workflow rules, gather the necessary passages, then produce the final JSON payload.',
      'Respond only with the final JSON once you have all required context.',
    ].join('\n\n');

    const agentMessages: AgentInputItem[] = [createUserMessage(initialMessage)];
    const agentResult = await run(agent, agentMessages);
    const finalText = extractFinalText(agentResult);

    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(finalText);
    } catch (_error) {
      console.error('[article-agent] Failed to parse agent output', finalText);
      return NextResponse.json({ error: 'Agent output was not valid JSON' }, { status: 500 });
    }
    const payloadResult = ArticleModelSchema.safeParse(parsedOutput);
    if (!payloadResult.success) {
      console.error('[article-agent] Agent output failed schema validation', payloadResult.error);
      return NextResponse.json({ error: 'Agent output failed validation' }, { status: 500 });
    }

    const payload = payloadResult.data;
    payload.source_urls = [siteUrl];

    const wordCount = computeTotalWordCount(payload);
    const usage = { inputTokens: null, outputTokens: null };
    const articleRecord = composeArticleRecord(payload, { ...context, siteUrl }, systemInstructions, usage, wordCount);
    const persistenceResult = await insertOrUpdateArticle(articleRecord);

    const response: GenerationResult = {
      articleId: persistenceResult.articleId,
      status: persistenceResult.status,
      title: persistenceResult.title,
      updated: persistenceResult.updated,
      wordCount,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[article-agent] Failed to generate article', error);
    const message = error instanceof Error ? error.message : 'Failed to generate article';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
