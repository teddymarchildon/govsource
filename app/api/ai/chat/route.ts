import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { z } from 'zod';
import { fetchHtmlContent, processDocumentContent } from '@/utils/documentUtils';
import { createClient } from '@/utils/supabase/server';
import { Agent, run, tool } from '@openai/agents';

type PresetType = 'default' | 'summarizeKeyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

const PRESET_PROMPTS: Record<PresetType, string> = {
  default: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Answer questions based on the document content. Be objective and factual about the contents of the document.',
  summarizeKeyPoints: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Provide a concise summary of the document, highlighting its main purpose, key points, and potential impact. Extract and explain the most important requirements and provisions. Be objective and factual about the contents of the document.',
  historicalContext: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Provide historical context for this document. Explain how it relates to previous legislation, what problems it aims to solve, and how it fits into the broader legislative history on this topic. Be objective and factual about the contents of the document.',
  prosAndCons: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Analyze the potential benefits and drawbacks of this document. Present a balanced view of arguments for and against its provisions, considering different stakeholder perspectives. Be objective and factual about the contents of the document.',
  diff: 'You are an AI assistant helping a user understand the differences between two versions of a US Federal Government document. Compare the two versions and explain the differences in content, structure, and meaning. Be specific about what changed.'
};

const PRESET_KEYWORDS: Record<PresetType, string[]> = {
  default: [],
  summarizeKeyPoints: [
    'purpose', 'establishes', 'provides', 'creates', 'amends', 'act', 'section', 'title',
    'shall', 'must', 'requires', 'requirement', 'provision', 'prohibits', 'authorizes'
  ],
  historicalContext: ['whereas', 'background', 'previously', 'history', 'amended', 'prior', 'existing', 'finds that'],
  prosAndCons: ['benefit', 'impact', 'effect', 'cost', 'concern', 'advantage', 'disadvantage', 'improve', 'risk'],
  diff: ['change', 'modification', 'addition', 'deletion', 'revision', 'amend', 'strike', 'insert']
};

const PRESET_INSTRUCTIONS: Record<PresetType, string> = {
  default: 'Answer the user\'s question based on the provided sections.',
  summarizeKeyPoints: 'Based on these key sections, provide a comprehensive summary of the document\'s main purpose and implications. Extract and explain the most important requirements and provisions from these sections.',
  historicalContext: 'Using these sections, explain the historical background and what led to this document.',
  prosAndCons: 'Analyze these sections to present balanced arguments for and against the document\'s provisions.',
  diff: 'Compare the provided sections to identify and explain the key differences.'
};

interface DocumentChunk {
  content: string;
  index: number;
}

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

function chunkDocument(content: string, targetChunkSize: number = 3000): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const cleanedContent = cleanHtml(content);
  const sizeChunks = splitBySize(cleanedContent, targetChunkSize);
  sizeChunks.forEach((chunk, index) => {
    chunks.push({ content: chunk, index });
  });
  return chunks;
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

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    // Deep search for any { type: 'output_text', text: string }
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
        if (v && (typeof v === 'object')) stack.push(v);
      }
    }
  } catch {}
  return typeof result === 'string' ? result : JSON.stringify(result);
}

export async function POST(request: Request) {
  try {
    const { messages, documentTitle, htmlFilePath, documentType, presetType = 'default', userId } = await request.json();

    if (!messages || !messages.length) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    let aiUsage: number | undefined = undefined;
    let isAnonymous = false;
    if (!userId) {
      const cookieStore = await cookies();
      aiUsage = parseInt(cookieStore.get('ai_usage')?.value || '0', 10);
      if (isNaN(aiUsage)) aiUsage = 0;
      if (aiUsage >= 3) {
        return NextResponse.json({ error: 'AI usage limit reached for anonymous users. Please log in to continue.' }, { status: 403 });
      }
      aiUsage += 1;
      isAnonymous = true;
    }

    if (userId) {
      const supabase = await createClient();
      const { data: subscription, error: subError } = await supabase
        .from('subscription')
        .select('tier')
        .eq('user_id', userId)
        .maybeSingle();
      if (subError) {
        return NextResponse.json({ error: 'Failed to check subscription.' }, { status: 500 });
      }
      const isPaid = subscription && subscription.tier === 'paid';
      const { data: usage, error: usageError } = await supabase
        .from('user_usage')
        .select('ai_interactions')
        .eq('user_id', userId)
        .maybeSingle();
      if (usageError) {
        return NextResponse.json({ error: 'Failed to check AI usage.' }, { status: 500 });
      }
      const aiInteractions = usage?.ai_interactions ?? 0;
      if (!isPaid && aiInteractions >= 5) {
        return NextResponse.json({ error: 'AI usage limit reached. Please upgrade to continue.' }, { status: 403 });
      }
      const { error: updateError } = await supabase
        .from('user_usage')
        .update({ ai_interactions: aiInteractions + 1 })
        .eq('user_id', userId);
      if (updateError) {
        return NextResponse.json({ error: 'Failed to increment AI usage.' }, { status: 500 });
      }
    }

    const userQuery: string = messages[messages.length - 1]?.content ?? '';

    let storageBucket = '';
    switch (documentType) {
      case 'bill':
      case 'law':
        storageBucket = 'bill-htmls';
        break;
      case 'agencyDocument':
      case 'executiveOrder':
        storageBucket = 'agency-docs';
        break;
      case 'opinion':
        storageBucket = 'opinions';
        break;
      default:
        storageBucket = 'bill-htmls';
    }

    if (!htmlFilePath) {
      return NextResponse.json({ error: 'No document content available' }, { status: 404 });
    }

    const rawHtml = await fetchHtmlContent(storageBucket, htmlFilePath);
    if (!rawHtml) {
      return NextResponse.json({ error: 'No document content available' }, { status: 404 });
    }

    const processed = processDocumentContent(rawHtml);
    if (!processed) {
      return NextResponse.json({ error: 'Failed to process document content' }, { status: 500 });
    }

    const chunks = chunkDocument(processed);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Document contains no extractable text' }, { status: 404 });
    }

    // Precompute embeddings for all chunks
    const embeddingsResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks.map(c => c.content)
    });
    const chunkEmbeddings: number[][] = embeddingsResp.data.map(d => d.embedding);

    // Tools close over the request-scoped context
    const searchRelevantSections = tool({
      name: 'search_relevant_sections',
      description: 'Return top relevant sections by semantic similarity. Use before fetching content.',
      parameters: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(8).nullable()
      }),
      execute: async (input) => {
        const { query, limit } = input as { query: string; limit: number | null };
        const q = typeof query === 'string' ? query : '';
        const k = typeof limit === 'number' && !Number.isNaN(limit) ? limit : 5;
        const qEmbedResp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: q });
        const qVec = qEmbedResp.data[0].embedding;
        const scored = chunkEmbeddings.map((vec, i) => ({
          id: i,
          score: cosineSimilarity(qVec, vec)
        }));
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, k).map(s => ({
          id: s.id,
          score: s.score,
          preview: chunks[s.id].content.slice(0, 400)
        }));
        return JSON.stringify(top);
      }
    });

    const fetchMoreContent = tool({
      name: 'fetch_more_content',
      description: 'Fetch full text for specific sections by ids or a fuzzy section query. Returns assembled, ordered context citing [Section N].',
      parameters: z.object({
        chunk_ids: z.array(z.number()).nullable(),
        section_query: z.string().nullable(),
        max_sections: z.number().int().min(1).max(8).nullable()
      }),
      execute: async (input) => {
        const { chunk_ids, section_query, max_sections } = input as { chunk_ids: number[] | null; section_query: string | null; max_sections: number | null };
        const max = typeof max_sections === 'number' && !Number.isNaN(max_sections) ? max_sections : 6;
        let selected: DocumentChunk[] = [];
        if (Array.isArray(chunk_ids) && chunk_ids.length > 0) {
          selected = chunk_ids
            .map(id => chunks[id])
            .filter(Boolean)
            .slice(0, max)
            .sort((a, b) => a.index - b.index);
        } else if (typeof section_query === 'string' && section_query.trim().length > 0) {
          const q = section_query.toLowerCase();
          const terms = q.split(/\s+/).filter(Boolean);
          const scored = chunks.map((c, i) => ({
            idx: i,
            score: terms.reduce((acc, t) => acc + ((c.content.toLowerCase().match(new RegExp(t, 'gi')) || []).length), 0)
          }));
          scored.sort((a, b) => b.score - a.score);
          selected = scored.slice(0, max).map(s => chunks[s.idx]).sort((a, b) => a.index - b.index);
        }
        if (selected.length === 0) return 'No matching sections found.';
        let text = `Here are relevant sections from the document "${documentTitle}":\n\n`;
        selected.forEach((c, i) => {
          text += `[Section ${i + 1}]\n${c.content}\n\n`;
          if (i < selected.length - 1) text += '---\n\n';
        });
        text += '\n[Note: Partial content shown. The full document may contain additional details.]';
        return text;
      }
    });

    const getDocumentMetadata = tool({
      name: 'get_document_metadata',
      description: 'Return basic document metadata.',
      parameters: z.object({}),
      execute: async () => JSON.stringify({ title: documentTitle, type: documentType, presetType })
    });

    const presetPrompt = PRESET_PROMPTS[(presetType as PresetType) || 'default'] || PRESET_PROMPTS.default;
    const systemInstructions = [
      `You are an objective government document analysis assistant. Document: "${documentTitle}".`,
      presetPrompt,
      'Use tools to search first, then fetch content for relevant sections. Ground answers only in fetched text and cite [Section N]. If needed info is missing, say so explicitly and suggest what to fetch next.'
    ].join('\n\n');

    const agent = new Agent({
      name: 'DocumentAssistant',
      instructions: systemInstructions,
      tools: [searchRelevantSections, fetchMoreContent, getDocumentMetadata],
      model: 'gpt-4o-mini'
    });

    const result = await run(agent, userQuery);
    const finalText = extractFinalText(result);

    let response = new NextResponse(finalText, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
    if (isAnonymous && typeof aiUsage === 'number') {
      response.cookies.set('ai_usage', aiUsage.toString(), { path: '/', maxAge: 60 * 60 * 24 * 30 });
    }
    return response;
  } catch (error) {
    console.error('Error processing AI chat request:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
