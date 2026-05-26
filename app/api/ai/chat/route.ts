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

type PresetType = 'default' | 'summarizeKeyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

const PRESET_PROMPTS: Record<PresetType, string> = {
  default: 'Answer questions based on the document content. Be objective and factual.',
  summarizeKeyPoints: 'Provide a concise summary highlighting main purpose, key points, and potential impact.',
  historicalContext: 'Provide historical context explaining how it relates to previous legislation and broader legislative history.',
  prosAndCons: 'Analyze potential benefits and drawbacks with a balanced view considering different stakeholder perspectives.',
  diff: 'Compare the two versions and explain differences in content, structure, and meaning.'
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
  presetType: z.enum(['default', 'summarizeKeyPoints', 'historicalContext', 'prosAndCons', 'diff']).default('default'),
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
): Promise<{ title: string; sources: DocumentSource[] }> {
  const documentId = Number(params.documentId);
  if (!Number.isFinite(documentId)) {
    throw new RouteResponseError('Invalid document id', 400);
  }

  if (params.documentType === 'bill' || params.documentType === 'law') {
    const { data: bill, error: billError } = await supabase
      .from('bill')
      .select('id, title, law_title')
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

    return {
      title: (params.documentType === 'law' ? bill.law_title : bill.title) || params.documentTitle || 'Untitled document',
      sources: textRows.map((row, idx) => ({
        label: params.presetType === 'diff'
          ? `${idx === 0 ? 'Newer version' : 'Older version'}${row.date ? ` (${row.date})` : ''}`
          : 'Current version',
        bucket: STORAGE_BUCKETS[params.documentType],
        htmlFilePath: row.html_file_path,
      })),
    };
  }

  if (params.documentType === 'agencyDocument' || params.documentType === 'executiveOrder') {
    const { data: document, error } = await supabase
      .from('agency_document')
      .select('id, title, subtype, html_file_path')
      .eq('id', documentId)
      .maybeSingle();

    if (error) throw error;
    if (!document?.html_file_path) throw new RouteResponseError('No document content available', 404);

    if (params.documentType === 'executiveOrder' && document.subtype !== 'Executive Order') {
      throw new RouteResponseError('Document type mismatch', 400);
    }

    return {
      title: document.title || params.documentTitle || 'Untitled document',
      sources: [{
        label: params.documentType === 'executiveOrder' ? 'Executive order' : 'Agency document',
        bucket: STORAGE_BUCKETS[params.documentType],
        htmlFilePath: document.html_file_path,
      }],
    };
  }

  const { data: cluster, error: clusterError } = await supabase
    .from('cluster')
    .select('id, case_name')
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
      description: 'Return top relevant sections by semantic similarity.',
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(8).nullable()
      }),
      execute: async ({ query, limit }) => {
        const k = limit ?? 5;
        const qEmbed = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
        const qVec = qEmbed.data[0].embedding;

        const scored = chunkEmbeddings
          .map((vec, i) => ({ id: i, score: cosineSimilarity(qVec, vec) }))
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
      description: 'Fetch full text for specific sections by ids.',
      parameters: z.object({
        chunk_ids: z.array(z.number()).nullable(),
        max_sections: z.number().int().min(1).max(8).nullable()
      }),
      execute: async ({ chunk_ids, max_sections }) => {
        const max = max_sections ?? 6;
        const selected = (chunk_ids || [])
          .map(id => chunks[id])
          .filter(Boolean)
          .slice(0, max)
          .sort((a, b) => a.index - b.index);

        if (!selected.length) return 'No matching sections found.';

        selected.forEach(c => referencedChunkIds.add(c.index));
        const text = selected.map((c) => `[Section ${c.index + 1}] ${c.sourceLabel}\n${c.content}`).join('\n\n---\n\n');
        return `Relevant sections from "${resolvedDocument.title}":\n\n${text}\n\n[Note: Partial content shown.]`;
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
      })
    });

    // Create agent
    const preset = PRESET_PROMPTS[(presetType as PresetType)] || PRESET_PROMPTS.default;
    const agent = new Agent({
      name: 'DocumentAssistant',
      instructions: `You are an objective government document analysis assistant. Document: "${resolvedDocument.title}".\n\n${preset}\n\nUse tools to search first, then fetch content. Ground answers in fetched text and cite [Section N]. Never cite a section unless it was returned by fetch_more_content.`,
      tools: [searchRelevantSections, fetchMoreContent, getDocumentMetadata],
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
