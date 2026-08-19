import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { z } from 'zod';
import { fetchHtmlContent, processDocumentContent } from '@/utils/documentUtils';
import { createClient } from '@/utils/supabase/server';
import { AI_FREE_USAGE_LIMIT, ANON_LIMIT } from '@/constants/onboarding';
import {
  Agent,
  run,
  tool,
  assistant as createAssistantMessage,
  user as createUserMessage,
  type AgentInputItem,
} from '@openai/agents';

type PresetType = 'default' | 'summarizeKeyPoints' | 'documentContext' | 'prosAndCons' | 'diff' | 'deadlines' | 'affectedParties';

const PRESET_PROMPTS: Record<PresetType, string> = {
  default: 'Answer questions based on the document content. Be objective and factual.',
  summarizeKeyPoints: 'Provide a concise summary highlighting main purpose, key points, and potential impact.',
  documentContext: 'Explain the context available inside this document, including stated background, findings, purposes, authorities, and cross-references. Do not imply outside historical research.',
  prosAndCons: 'Analyze potential benefits and drawbacks with a balanced view considering different stakeholder perspectives.',
  diff: 'Compare the two versions and explain differences in content, structure, and meaning.',
  deadlines: 'Identify dates, deadlines, effective dates, reporting timelines, comment periods, and implementation milestones stated in the document.',
  affectedParties: 'Identify agencies, regulated entities, beneficiaries, officials, jurisdictions, or other parties affected by the document.'
};

const STORAGE_BUCKETS: Record<string, string> = {
  bill: 'bill-htmls',
  law: 'bill-htmls',
  agencyDocument: 'agency-docs',
  executiveOrder: 'agency-docs',
  opinion: 'opinions'
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type DocumentSource = {
  label: string;
  bucket: string;
  htmlFilePath: string;
};
type DocumentChunk = {
  content: string;
  index: number;
  sourceLabel: string;
};
type ResolvedDocument = {
  title: string;
  sources: DocumentSource[];
  metadata: Record<string, unknown>;
};
type ActivityStatus = 'running' | 'completed' | 'error';
type StreamPayload =
  | { type: 'phase'; id: string; label: string; status: ActivityStatus; detail?: string }
  | { type: 'tool'; id: string; label: string; status: ActivityStatus; detail?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'citations'; citations: CitationPayload[] }
  | { type: 'stream_end' }
  | { type: 'error'; message: string };

type CitationPayload = {
  label: string;
  section: number;
  page?: number;
  searchText: string;
};

function getToolDisplayLabel(toolName: string): string {
  switch (toolName) {
    case 'search_relevant_sections':
      return 'Finding relevant sections';
    case 'fetch_more_content':
      return 'Reading source text';
    case 'get_document_metadata':
      return 'Checking document metadata';
    case 'find_defined_terms':
      return 'Finding definitions';
    case 'find_dates_and_deadlines':
      return 'Finding dates and deadlines';
    case 'find_affected_parties':
      return 'Finding affected parties';
    case 'compare_versions':
      return 'Comparing versions';
    default:
      return 'Running analysis step';
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const maxDuration = 60;

// --- Utility functions ---

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })).min(1),
  documentId: z.union([z.string(), z.number()]).transform(String),
  documentTitle: z.string().optional(),
  // Accepted for backwards compatibility with the current client. The route
  // resolves authoritative source paths from documentId instead of trusting it.
  htmlFilePath: z.string().optional(),
  documentType: z.enum(['bill', 'law', 'agencyDocument', 'executiveOrder', 'opinion']),
  presetType: z.enum(['default', 'summarizeKeyPoints', 'documentContext', 'historicalContext', 'prosAndCons', 'diff', 'deadlines', 'affectedParties'])
    .default('default')
    .transform((preset) => preset === 'historicalContext' ? 'documentContext' : preset),
  diffHtmlFilePaths: z.array(z.string().optional()).optional(),
});

function cleanHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function chunkDocument(content: string, sourceLabel: string, startIndex = 0, chunkSize = 3000, overlap = 200): DocumentChunk[] {
  const text = cleanHtml(content);
  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = startIndex;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('. ', end);
      if (sentenceEnd > start + chunkSize * 0.8) end = sentenceEnd + 1;
    }
    chunks.push({ content: text.slice(start, end), index: index++, sourceLabel });
    start = end - (end < text.length ? overlap : 0);
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, a2 = 0, b2 = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    a2 += a[i] * a[i];
    b2 += b[i] * b[i];
  }
  return a2 && b2 ? dot / (Math.sqrt(a2) * Math.sqrt(b2)) : 0;
}

function extractSectionNumbers(content: string): number[] {
  const matches = content.match(/\[Section\s+(\d+)\]/gi) || [];
  const sections = matches
    .map(m => {
      const parsed = m.match(/\d+/)?.[0];
      return parsed ? parseInt(parsed, 10) : NaN;
    })
    .filter(n => Number.isFinite(n) && n > 0) as number[];
  return [...new Set(sections)];
}

class RouteResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function resolveDocumentSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: z.infer<typeof ChatRequestSchema>
): Promise<ResolvedDocument> {
  const documentId = Number(params.documentId);
  if (!Number.isFinite(documentId)) {
    throw new RouteResponseError('Invalid document id', 400);
  }

  if (params.documentType === 'bill' || params.documentType === 'law') {
    const { data: bill, error: billError } = await supabase
      .from('bill')
      .select('id, title, law_title, congress, number, type, introduced_date, policy_area, law_enacted_date, law_number, law_type')
      .eq('id', documentId)
      .maybeSingle();

    if (billError) throw billError;
    if (!bill) throw new RouteResponseError('Document not found', 404);

    const textLimit = params.presetType === 'diff' ? 2 : 1;
    const { data: textRows, error: textError } = await supabase
      .from('bill_text')
      .select('html_file_path, date, type')
      .eq('bill_id', documentId)
      .not('html_file_path', 'is', null)
      .order('date', { ascending: false, nullsFirst: false })
      .limit(textLimit);

    if (textError) throw textError;
    if (!textRows?.length) throw new RouteResponseError('No document content available', 404);

    const [{ data: actionsData }, { data: summaryData }, { data: sponsorData }] = await Promise.all([
      supabase
        .from('bill_action')
        .select('date, text, type')
        .eq('bill_id', documentId)
        .order('date', { ascending: false, nullsFirst: false })
        .limit(5),
      supabase
        .from('bill_summary')
        .select('text')
        .eq('bill', documentId)
        .order('date', { ascending: false, nullsFirst: false })
        .limit(1),
      supabase
        .from('sponsored_bills')
        .select('congressman:congressman(full_name, party, state, chamber)')
        .eq('bill_id', documentId)
        .limit(1),
    ]);

    return {
      title: (params.documentType === 'law' ? bill.law_title : bill.title) || params.documentTitle || 'Untitled document',
      sources: textRows.map((row, idx) => ({
        label: params.presetType === 'diff'
          ? `${idx === 0 ? 'Newer version' : 'Older version'}${row.date ? ` (${row.date})` : ''}`
          : 'Current version',
        bucket: STORAGE_BUCKETS[params.documentType],
        htmlFilePath: row.html_file_path,
      })),
      metadata: {
        id: bill.id,
        documentType: params.documentType,
        congress: bill.congress,
        number: bill.number,
        billType: bill.type,
        introducedDate: bill.introduced_date,
        policyArea: bill.policy_area,
        lawEnactedDate: bill.law_enacted_date,
        lawNumber: bill.law_number,
        lawType: bill.law_type,
        sponsor: sponsorData?.[0]?.congressman ?? null,
        latestActions: actionsData ?? [],
        summary: summaryData?.[0]?.text ?? null,
        sourceVersions: textRows.map((row, idx) => ({
          label: params.presetType === 'diff'
            ? `${idx === 0 ? 'Newer version' : 'Older version'}${row.date ? ` (${row.date})` : ''}`
            : 'Current version',
          date: row.date,
          type: row.type,
        })),
      },
    };
  }

  if (params.documentType === 'agencyDocument' || params.documentType === 'executiveOrder') {
    const { data: document, error } = await supabase
      .from('agency_document')
      .select('id, title, type, subtype, publication_date, signing_date, president, remote_document_number, abstract, html_url, pdf_url, html_file_path')
      .eq('id', documentId)
      .maybeSingle();

    if (error) throw error;
    if (!document?.html_file_path) throw new RouteResponseError('No document content available', 404);

    if (params.documentType === 'executiveOrder' && document.subtype !== 'Executive Order') {
      throw new RouteResponseError('Document type mismatch', 400);
    }

    const { data: agencyLinks } = await supabase
      .from('agency_agencydocument')
      .select('agency:agency(id, name, short_name, slug)')
      .eq('agency_document_id', documentId)
      .limit(5);

    return {
      title: document.title || params.documentTitle || 'Untitled document',
      sources: [{
        label: params.documentType === 'executiveOrder' ? 'Executive order' : 'Agency document',
        bucket: STORAGE_BUCKETS[params.documentType],
        htmlFilePath: document.html_file_path,
      }],
      metadata: {
        id: document.id,
        documentType: params.documentType,
        type: document.type,
        subtype: document.subtype,
        publicationDate: document.publication_date,
        signingDate: document.signing_date,
        president: document.president,
        remoteDocumentNumber: document.remote_document_number,
        abstract: document.abstract,
        htmlUrl: document.html_url,
        pdfUrl: document.pdf_url,
        agencies: agencyLinks?.map((link) => link.agency).filter(Boolean) ?? [],
      },
    };
  }

  const { data: cluster, error: clusterError } = await supabase
    .from('cluster')
    .select('id, case_name, case_name_short, date_filed, judges, court:court(full_name, short_name)')
    .eq('id', documentId)
    .maybeSingle();

  if (clusterError) throw clusterError;
  if (!cluster) throw new RouteResponseError('Document not found', 404);

  const { data: opinions, error: opinionsError } = await supabase
    .from('court_opinion')
    .select('html_file_path, date, type')
    .eq('cluster_id', documentId)
    .not('html_file_path', 'is', null)
    .order('date', { ascending: false, nullsFirst: false })
    .limit(1);

  if (opinionsError) throw opinionsError;
  if (!opinions?.length) throw new RouteResponseError('No document content available', 404);

  return {
    title: cluster.case_name || params.documentTitle || 'Untitled opinion',
    sources: [{
      label: opinions[0].type ? `${opinions[0].type} opinion` : 'Opinion',
      bucket: STORAGE_BUCKETS.opinion,
      htmlFilePath: opinions[0].html_file_path,
    }],
    metadata: {
      id: cluster.id,
      documentType: params.documentType,
      caseName: cluster.case_name,
      caseNameShort: cluster.case_name_short,
      dateFiled: cluster.date_filed,
      judges: cluster.judges,
      court: cluster.court,
      opinion: {
        type: opinions[0].type,
        date: opinions[0].date,
      },
    },
  };
}

async function buildChunksForSources(sources: DocumentSource[]): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];

  for (const source of sources) {
    const rawHtml = await fetchHtmlContent(source.bucket, source.htmlFilePath);
    const processed = rawHtml ? processDocumentContent(rawHtml) : null;
    if (!processed) continue;
    chunks.push(...chunkDocument(processed, source.label, chunks.length));
  }

  return chunks;
}

function matchesSourceFilter(chunk: DocumentChunk, sourceFilter?: string | null): boolean {
  if (!sourceFilter?.trim()) return true;
  return chunk.sourceLabel.toLowerCase().includes(sourceFilter.trim().toLowerCase());
}

function formatChunksForTool(title: string, selected: DocumentChunk[], intro = 'Relevant sections'): string {
  if (!selected.length) return 'No matching sections found.';
  const text = selected
    .map((c) => `[Section ${c.index + 1}] ${c.sourceLabel}\n${c.content}`)
    .join('\n\n---\n\n');
  return `${intro} from "${title}":\n\n${text}\n\n[Note: Partial content shown.]`;
}

function findChunksByTerms(chunks: DocumentChunk[], terms: string[], max: number, sourceFilter?: string | null): DocumentChunk[] {
  const normalizedTerms = terms.map(term => term.trim().toLowerCase()).filter(Boolean);
  if (!normalizedTerms.length) return [];

  return chunks
    .filter(chunk => matchesSourceFilter(chunk, sourceFilter))
    .map(chunk => {
      const text = chunk.content.toLowerCase();
      const score = normalizedTerms.reduce((sum, term) => sum + (text.match(new RegExp(escapeRegExp(term), 'g'))?.length ?? 0), 0);
      return { chunk, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(entry => entry.chunk)
    .sort((a, b) => a.index - b.index);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function incrementAuthenticatedUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  currentInteractions: number
) {
  const { error } = await supabase
    .from('user_usage')
    .upsert(
      { user_id: userId, ai_interactions: currentInteractions + 1 },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('Failed to update user usage:', error);
  }
}

// --- Main handler ---

export async function POST(request: Request) {
  try {
    const parsedRequest = ChatRequestSchema.safeParse(await request.json());
    if (!parsedRequest.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const requestBody = parsedRequest.data;
    const { presetType, documentType } = requestBody;
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const authenticatedUserId = authData.user?.id;

    // Validate messages
    const chatMessages: ChatMessage[] = requestBody.messages
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));

    if (!chatMessages.length || chatMessages[chatMessages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'A user message is required' }, { status: 400 });
    }

    // Handle anonymous usage limits
    let aiUsage: number | undefined;
    let isAnonymous = false;
    if (!authenticatedUserId) {
      const cookieStore = await cookies();
      aiUsage = parseInt(cookieStore.get('ai_usage')?.value || '0', 10) || 0;
      if (aiUsage >= ANON_LIMIT) {
        return NextResponse.json({ error: 'AI usage limit reached. Please log in to continue.' }, { status: 403 });
      }
      aiUsage += 1;
      isAnonymous = true;
    }

    // Handle authenticated user usage limits
    let authenticatedUsageCount: number | undefined;
    if (authenticatedUserId) {
      const [{ data: subscription }, { data: usage }] = await Promise.all([
        supabase.from('subscription').select('tier').eq('user_id', authenticatedUserId).maybeSingle(),
        supabase.from('user_usage').select('ai_interactions').eq('user_id', authenticatedUserId).maybeSingle()
      ]);

      const isPaid = subscription?.tier === 'paid';
      const interactions = usage?.ai_interactions ?? 0;
      authenticatedUsageCount = interactions;

      if (!isPaid && interactions >= AI_FREE_USAGE_LIMIT) {
        return NextResponse.json({ error: 'AI usage limit reached. Please upgrade to continue.' }, { status: 403 });
      }
    }

    // Fetch and process document
    const resolvedDocument = await resolveDocumentSources(supabase, requestBody);
    if (presetType === 'diff' && resolvedDocument.sources.length < 2) {
      return NextResponse.json({ error: 'No document content available' }, { status: 404 });
    }

    const chunks = await buildChunksForSources(resolvedDocument.sources);
    if (!chunks.length) {
      return NextResponse.json({ error: 'Document contains no extractable text' }, { status: 404 });
    }

    // Precompute embeddings
    const embeddingsResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks.map(c => c.content)
    });
    const chunkEmbeddings = embeddingsResp.data.map(d => d.embedding);

    // Define tools
    const referencedChunkIds = new Set<number>();

    const searchRelevantSections = tool({
      name: 'search_relevant_sections',
      description: 'Return top relevant sections by semantic similarity. Use source_filter for diff questions such as "newer" or "older".',
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(8).nullable(),
        source_filter: z.string().nullable(),
      }),
      execute: async ({ query, limit, source_filter }) => {
        const k = limit ?? 5;
        const qEmbed = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
        const qVec = qEmbed.data[0].embedding;

        const scored = chunkEmbeddings
          .map((vec, i) => ({ id: i, score: cosineSimilarity(qVec, vec) }))
          .filter(s => matchesSourceFilter(chunks[s.id], source_filter))
          .sort((a, b) => b.score - a.score)
          .slice(0, k)
          .map(s => ({
            id: s.id,
            score: s.score,
            source: chunks[s.id].sourceLabel,
            preview: chunks[s.id].content.slice(0, 400),
          }));

        return JSON.stringify(scored);
      }
    });

    const fetchMoreContent = tool({
      name: 'fetch_more_content',
      description: 'Fetch full text for specific sections by ids or by a fuzzy phrase query. Use source_filter for diff questions such as "newer" or "older".',
      parameters: z.object({
        chunk_ids: z.array(z.number()).nullable(),
        section_query: z.string().nullable(),
        max_sections: z.number().int().min(1).max(8).nullable(),
        source_filter: z.string().nullable(),
      }),
      execute: async ({ chunk_ids, section_query, max_sections, source_filter }) => {
        const max = max_sections ?? 6;
        let selected: DocumentChunk[] = [];

        if (chunk_ids?.length) {
          selected = chunk_ids
            .map(id => chunks[id])
            .filter(Boolean)
            .filter(chunk => matchesSourceFilter(chunk, source_filter))
            .slice(0, max)
            .sort((a, b) => a.index - b.index);
        } else if (section_query?.trim()) {
          selected = findChunksByTerms(chunks, section_query.split(/\s+/), max, source_filter);
        }

        selected.forEach(c => referencedChunkIds.add(c.index));
        return formatChunksForTool(resolvedDocument.title, selected);
      }
    });

    const findDefinedTerms = tool({
      name: 'find_defined_terms',
      description: 'Find passages that define important terms. Use when the user asks what a term means or asks for definitions.',
      parameters: z.object({
        term: z.string().nullable(),
        max_sections: z.number().int().min(1).max(8).nullable(),
        source_filter: z.string().nullable(),
      }),
      execute: async ({ term, max_sections, source_filter }) => {
        const max = max_sections ?? 6;
        const definitionTerms = term?.trim()
          ? [term, 'means', 'defined', 'definition', 'term']
          : ['means', 'defined', 'definition', 'term', 'shall mean', 'includes'];
        const selected = findChunksByTerms(chunks, definitionTerms, max, source_filter);
        selected.forEach(c => referencedChunkIds.add(c.index));
        return formatChunksForTool(resolvedDocument.title, selected, 'Definition-related sections');
      }
    });

    const findDatesAndDeadlines = tool({
      name: 'find_dates_and_deadlines',
      description: 'Find dates, deadlines, effective dates, comment periods, reporting timelines, and implementation milestones.',
      parameters: z.object({
        topic: z.string().nullable(),
        max_sections: z.number().int().min(1).max(8).nullable(),
        source_filter: z.string().nullable(),
      }),
      execute: async ({ topic, max_sections, source_filter }) => {
        const max = max_sections ?? 6;
        const selected = chunks
          .filter(chunk => matchesSourceFilter(chunk, source_filter))
          .map(chunk => {
            const text = chunk.content.toLowerCase();
            const keywordScore = ['date', 'deadline', 'effective', 'expires', 'within', 'not later than', 'days after', 'comment period', 'report', 'implementation']
              .reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
            const dateScore = (chunk.content.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d+\s+days?\b/gi) || []).length;
            const topicScore = topic?.trim() && text.includes(topic.trim().toLowerCase()) ? 2 : 0;
            return { chunk, score: keywordScore + dateScore + topicScore };
          })
          .filter(entry => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, max)
          .map(entry => entry.chunk)
          .sort((a, b) => a.index - b.index);

        selected.forEach(c => referencedChunkIds.add(c.index));
        return formatChunksForTool(resolvedDocument.title, selected, 'Date and deadline sections');
      }
    });

    const findAffectedParties = tool({
      name: 'find_affected_parties',
      description: 'Find passages identifying agencies, regulated entities, beneficiaries, officials, jurisdictions, or other affected parties.',
      parameters: z.object({
        party_query: z.string().nullable(),
        max_sections: z.number().int().min(1).max(8).nullable(),
        source_filter: z.string().nullable(),
      }),
      execute: async ({ party_query, max_sections, source_filter }) => {
        const max = max_sections ?? 6;
        const terms = party_query?.trim()
          ? party_query.split(/\s+/)
          : ['agency', 'secretary', 'administrator', 'state', 'local', 'tribal', 'person', 'entity', 'recipient', 'applicant', 'contractor', 'employee', 'consumer', 'beneficiary', 'regulated'];
        const selected = findChunksByTerms(chunks, terms, max, source_filter);
        selected.forEach(c => referencedChunkIds.add(c.index));
        return formatChunksForTool(resolvedDocument.title, selected, 'Affected-party sections');
      }
    });

    const compareVersions = tool({
      name: 'compare_versions',
      description: 'For diff mode, fetch comparable high-relevance passages from each available source for a query.',
      parameters: z.object({
        query: z.string(),
        max_sections_per_source: z.number().int().min(1).max(4).nullable(),
      }),
      execute: async ({ query, max_sections_per_source }) => {
        if (resolvedDocument.sources.length < 2) {
          return 'Only one source version is available, so version comparison is unavailable.';
        }

        const max = max_sections_per_source ?? 3;
        const qEmbed = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
        const qVec = qEmbed.data[0].embedding;
        const selected = resolvedDocument.sources.flatMap(source => {
          return chunkEmbeddings
            .map((vec, i) => ({ id: i, score: cosineSimilarity(qVec, vec) }))
            .filter(s => chunks[s.id].sourceLabel === source.label)
            .sort((a, b) => b.score - a.score)
            .slice(0, max)
            .map(s => chunks[s.id]);
        }).sort((a, b) => a.index - b.index);

        selected.forEach(c => referencedChunkIds.add(c.index));
        return formatChunksForTool(resolvedDocument.title, selected, 'Comparable version sections');
      }
    });

    const getDocumentMetadata = tool({
      name: 'get_document_metadata',
      description: 'Return basic document metadata.',
      parameters: z.object({}),
      execute: async () => JSON.stringify({
        title: resolvedDocument.title,
        type: documentType,
        presetType,
        sources: resolvedDocument.sources.map(source => source.label),
        metadata: resolvedDocument.metadata,
      })
    });

    // Create agent
    const preset = PRESET_PROMPTS[(presetType as PresetType)] || PRESET_PROMPTS.default;
    const agent = new Agent({
      name: 'DocumentAssistant',
      instructions: `You are an objective government document analysis assistant. Document: "${resolvedDocument.title}".\n\n${preset}\n\nUse tools to search first, then fetch content. For definitions, deadlines, affected parties, or version comparisons, prefer the specialized tool for that task. Ground answers in fetched text and cite [Section N]. Never cite a section unless it was returned by a content-fetching tool. Do not use outside knowledge or imply research beyond the available document and metadata.`,
      tools: [
        searchRelevantSections,
        fetchMoreContent,
        findDefinedTerms,
        findDatesAndDeadlines,
        findAffectedParties,
        compareVersions,
        getDocumentMetadata,
      ],
      model: 'gpt-4o-mini'
    });

    // Stream response
    const encoder = new TextEncoder();
    const toolCallMap = new Map<string, string>();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: StreamPayload) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        send({ type: 'phase', id: 'understanding', label: 'Understanding request', status: 'running', detail: 'Analyzing your question' });

        try {
          const agentMessages: AgentInputItem[] = chatMessages.map(m =>
            m.role === 'user' ? createUserMessage(m.content) : createAssistantMessage(m.content)
          );

          const streamResult = await run(agent, agentMessages, { stream: true });
          let hasStartedStreaming = false;
          let finalContent = '';
          let enteredEvidencePhase = false;
          let enteredDraftingPhase = false;

          for await (const event of streamResult as AsyncIterable<any>) {
            if (!event) continue;

            // Handle raw model stream events for text deltas
            if (event.type === 'raw_model_stream_event') {
              const data = event.data;
              if (data?.type === 'output_text_delta' && typeof data.delta === 'string') {
                if (!hasStartedStreaming) {
                  hasStartedStreaming = true;
                  send({ type: 'phase', id: 'understanding', label: 'Understanding request', status: 'completed' });
                  if (enteredEvidencePhase) {
                    send({ type: 'phase', id: 'evidence', label: 'Gathering evidence', status: 'completed' });
                  }
                  enteredDraftingPhase = true;
                  send({ type: 'phase', id: 'drafting', label: 'Drafting response', status: 'running' });
                }
                finalContent += data.delta;
                send({ type: 'text_delta', delta: data.delta });
              }
              continue;
            }

            // Handle run item events for tool calls
            if (event.type === 'run_item_stream_event') {
              const { name: itemName, item } = event;

              if (itemName === 'tool_called' && item?.rawItem) {
                const { callId, name } = item.rawItem;
                const toolName = name || 'tool';
                toolCallMap.set(callId, toolName);
                if (!enteredEvidencePhase && !hasStartedStreaming) {
                  enteredEvidencePhase = true;
                  send({ type: 'phase', id: 'understanding', label: 'Understanding request', status: 'completed' });
                  send({ type: 'phase', id: 'evidence', label: 'Gathering evidence', status: 'running', detail: 'Reviewing source sections' });
                }
                send({ type: 'tool', id: callId, label: getToolDisplayLabel(toolName), status: 'running' });
              } else if (itemName === 'tool_output' && item?.rawItem) {
                const { callId } = item.rawItem;
                const toolName = toolCallMap.get(callId) || 'tool';
                send({ type: 'tool', id: callId, label: getToolDisplayLabel(toolName), status: 'completed' });
              }
            }
          }

          await (streamResult as any).completed;
          if (!hasStartedStreaming) {
            send({ type: 'phase', id: 'understanding', label: 'Understanding request', status: 'completed' });
            if (enteredEvidencePhase) {
              send({ type: 'phase', id: 'evidence', label: 'Gathering evidence', status: 'completed' });
            }
            enteredDraftingPhase = true;
            send({ type: 'phase', id: 'drafting', label: 'Drafting response', status: 'running' });
          }
          if (finalContent.trim()) {
            const sectionNumbers = extractSectionNumbers(finalContent);
            const citations: CitationPayload[] = sectionNumbers
              .map(section => {
                const chunkIndex = section - 1;
                const chunk = chunks[chunkIndex];
                if (!chunk) return null;
                if (referencedChunkIds.size > 0 && !referencedChunkIds.has(chunkIndex)) return null;
                return {
                  label: `${chunk.sourceLabel}, Section ${section}`,
                  section,
                  searchText: chunk.content.slice(0, 120).trim(),
                };
              })
              .filter((citation): citation is CitationPayload => Boolean(citation));

            if (citations.length > 0) {
              send({ type: 'citations', citations });
            }
          }
          if (enteredDraftingPhase) {
            send({ type: 'phase', id: 'drafting', label: 'Drafting response', status: 'completed' });
          }
          if (authenticatedUserId && authenticatedUsageCount !== undefined && finalContent.trim()) {
            await incrementAuthenticatedUsage(supabase, authenticatedUserId, authenticatedUsageCount);
          }
          send({ type: 'stream_end' });
        } catch (err) {
          console.error('Error streaming AI response:', err);
          send({ type: 'error', message: 'Failed to generate a response.' });
        } finally {
          controller.close();
        }
      }
    });

    const response = new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });

    if (isAnonymous && aiUsage !== undefined) {
      response.cookies.set('ai_usage', aiUsage.toString(), { path: '/', maxAge: 60 * 60 * 24 * 30 });
    }

    return response;
  } catch (error) {
    if (error instanceof RouteResponseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error processing AI chat request:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
