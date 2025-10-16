'use server'

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

type PrimaryItemType = 'bill' | 'law' | 'executive_order' | 'cluster';

interface ArticleContext {
  primaryItemType: PrimaryItemType;
  primaryItemId: number;
  siteUrl: string;
  metadata: Record<string, unknown>;
  textSections: Array<{ label: string; content: string }>;
}

interface GenerationResult {
  articleId: number;
  status: string;
  title: string;
  updated: boolean;
  wordCount: number;
}

const PROMPT_VERSION = 'v1';
const MODEL_NAME = 'gpt-4.1-mini';
const EXPECTED_SECTION_HEADINGS = ['What happened', 'Why it matters', 'Key implications'] as const;

const GenerateArticleSchema = z.object({
  primaryItemType: z.enum(['bill', 'law', 'executive_order', 'cluster']),
  primaryItemId: z.number().int().min(1),
});

const ArticleModelSchema = z.object({
  title: z.string().min(10).max(120),
  dek: z.string().min(1).max(160),
  summary: z.string().min(1).max(240),
  excerpt: z.string().min(1).max(200),
  body: z.object({
    sections: z
      .array(
        z.object({
          heading: z.enum(EXPECTED_SECTION_HEADINGS),
          bullets: z.array(z.string().min(1).max(160)).min(2).max(3),
        })
      )
      .length(3),
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

function ensureSectionsHeadings(sections: Array<{ heading: string }>) {
  const headings = sections.map((section) => section.heading);
  const expected = Array.from(EXPECTED_SECTION_HEADINGS);
  return expected.every((heading) => headings.includes(heading));
}

function buildPrompt(context: ArticleContext) {
  const { primaryItemType, metadata, textSections, siteUrl } = context;
  const trimmedSections = textSections.map((section) => ({
    label: section.label,
    content: truncate(section.content, 3500),
  }));

  const prompt = [
    `You are GovLens' editorial agent. Write a concise, factual briefing article about the provided ${primaryItemType.replace('_', ' ')}.`,
    'Rules:',
    '- Rely exclusively on the supplied metadata and text sections. Do not invent facts or speculate.',
    '- The finished product must be easy to scan: very short summary and three sections with bullets.',
    '- Stay within 180 total words across summary, dek, excerpt, and bullet content. Shorter is better.',
    '- Sections must be: "What happened", "Why it matters", "Key implications". Each with 2-3 bullet sentences under 25 words.',
    '- Use the provided source URL exactly once in the source list. Do not add any other URLs.',
    '- If critical facts are missing, explicitly note the gap inside the relevant bullet instead of fabricating.',
    '',
    'Return JSON that matches the provided schema. Ensure text is clean and human ready.',
    '',
    'Context:',
    JSON.stringify(
      {
        metadata,
        siteUrl,
        textSections: trimmedSections,
      },
      null,
      2
    ),
  ].join('\n');

  return prompt;
}

function convertBodyToMarkdown(body: z.infer<typeof ArticleModelSchema>['body']) {
  return body.sections
    .map((section) => {
      const heading = `### ${section.heading}`;
      const bullets = section.bullets.map((bullet) => `- ${bullet}`).join('\n');
      return `${heading}\n${bullets}`;
    })
    .join('\n\n');
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

  const textSections = [];
  if (summaryText) {
    textSections.push({ label: 'Official Summary', content: summaryText });
  }
  if (actionsText) {
    textSections.push({ label: 'Recent Actions', content: actionsText });
  }

  if (textSections.length === 0) {
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
    textSections,
  };
}

async function gatherExecutiveOrderContext(
  client: SupabaseClient,
  primaryItemId: number
): Promise<ArticleContext | null> {
  const { data: order, error } = await client
    .from('agency_document')
    .select(
      'id, title, abstract, type, subtype, remote_document_number, signing_date, publication_date, president'
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
    textSections: [
      {
        label: 'Executive Order Abstract',
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
    textSections,
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

function buildPromptTemplate(context: ArticleContext) {
  return [
    `GovLens Article Agent Prompt (version ${PROMPT_VERSION})`,
    `Primary type: ${context.primaryItemType}`,
    'Goal: Produce a concise briefing article highlighting what happened, why it matters, and key implications.',
    'Constraints: <=180 words total; three sections with bullet points; cite provided site URL only; no speculation.',
  ].join('\n');
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
    agent_identifier: 'govlens:article-agent:v1',
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
  const bodyWords = payload.body.sections.reduce(
    (sum, section) => sum + section.bullets.reduce((inner, bullet) => inner + countWords(bullet), 0),
    0
  );
  return summaryWords + dekWords + excerptWords + bodyWords;
}

function extractJsonFromResponse(response: OpenAI.Responses.Response) {
  if (response.output_text) {
    return response.output_text;
  }

  const outputItems = response.output ?? [];
  for (const item of outputItems) {
    if (item.type === 'message') {
      for (const content of item.content) {
        if (content.type === 'output_text' && content.text) {
          return content.text;
        }
      }
    } else if ('text' in item) {
      const maybeText = (item as { text?: unknown }).text;
      if (typeof maybeText === 'string' && maybeText) {
        return maybeText;
      }
    }
  }

  // Fallback: deep search
  const stack: unknown[] = Array.isArray(outputItems) ? [...outputItems] : [outputItems];
  const visited = new Set<unknown>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const candidate = current as { type?: unknown; text?: unknown };
    if (candidate.type === 'output_text' && typeof candidate.text === 'string') {
      return candidate.text;
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return null;
}

async function runArticleModel(prompt: string) {
  const response = await openai.responses.create({
    model: MODEL_NAME,
    input: [
      {
        role: 'system',
        content: 'You are a concise, factual editorial assistant for GovLens. Follow instructions exactly and emit valid JSON that matches the schema.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    text: {
      format: {
        type: 'json_schema',
        name: 'govlens_article_payload',
        schema: ARTICLE_JSON_SCHEMA,
        strict: true,
      },
    },
    max_output_tokens: 900,
  });

  const text = extractJsonFromResponse(response);
  if (!text) {
    throw new Error('Model returned no output');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    console.error('[article-agent] Failed to parse model JSON', text);
    throw new Error('Model response was not valid JSON');
  }

  const payload = ArticleModelSchema.safeParse(parsed);
  if (!payload.success) {
    console.error('[article-agent] Model output failed schema validation', payload.error);
    throw new Error('Model output failed validation');
  }

  if (!ensureSectionsHeadings(payload.data.body.sections)) {
    throw new Error('Model output missing required sections');
  }

  const wordCount = computeTotalWordCount(payload.data);
  if (wordCount > 200) {
    throw new Error(`Draft is too long (${wordCount} words).`);
  }

  return {
    payload: payload.data,
    wordCount,
    usage: {
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    },
  };
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
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = GenerateArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { primaryItemType, primaryItemId } = parsed.data;
    const context = await gatherContext(supabaseAdmin, primaryItemType, primaryItemId);
    if (!context) {
      return NextResponse.json({ error: 'Unable to gather article context' }, { status: 404 });
    }

    const siteUrl = buildSiteUrl(request, context.siteUrl);
    const prompt = buildPrompt({ ...context, siteUrl });
    const promptTemplate = buildPromptTemplate({ ...context, siteUrl });

    const { payload, wordCount, usage } = await runArticleModel(prompt);

    // Force source URL to the canonical site URL.
    payload.source_urls = [siteUrl];

    const articleRecord = composeArticleRecord(payload, { ...context, siteUrl }, promptTemplate, usage, wordCount);
    const result = await insertOrUpdateArticle(articleRecord);

    const response: GenerationResult = {
      articleId: result.articleId,
      status: result.status,
      title: result.title,
      updated: result.updated,
      wordCount,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[article-agent] Failed to generate article', error);
    const message = error instanceof Error ? error.message : 'Failed to generate article';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
const ARTICLE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'dek', 'summary', 'excerpt', 'body', 'source_urls'],
  properties: {
    title: { type: 'string', minLength: 10, maxLength: 120 },
    dek: { type: 'string', minLength: 1, maxLength: 160 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    excerpt: { type: 'string', minLength: 1, maxLength: 200 },
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['sections'],
      properties: {
        sections: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['heading', 'bullets'],
            properties: {
              heading: {
                type: 'string',
                enum: Array.from(EXPECTED_SECTION_HEADINGS),
              },
              bullets: {
                type: 'array',
                minItems: 2,
                maxItems: 3,
                items: { type: 'string', minLength: 1, maxLength: 160 },
              },
            },
          },
        },
      },
    },
    source_urls: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: { type: 'string', pattern: '^https?://.+' },
    },
  },
} as const;
