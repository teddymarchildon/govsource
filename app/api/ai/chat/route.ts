import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { fetchHtmlContent, processDocumentContent, truncateContent } from '@/utils/documentUtils';
import { createClient } from '@/utils/supabase/server';

// Define preset types and their corresponding system prompts
type PresetType = 'default' | 'summarizeKeyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

const PRESET_PROMPTS: Record<PresetType, string> = {
  default: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Answer questions based on the document content. Be objective and factual about the contents of the document.',
  summarizeKeyPoints: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Provide a concise summary of the document, highlighting its main purpose, key points, and potential impact. Extract and explain the most important requirements and provisions. Be objective and factual about the contents of the document.',
  historicalContext: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Provide historical context for this document. Explain how it relates to previous legislation, what problems it aims to solve, and how it fits into the broader legislative history on this topic. Be objective and factual about the contents of the document.',
  prosAndCons: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Analyze the potential benefits and drawbacks of this document. Present a balanced view of arguments for and against its provisions, considering different stakeholder perspectives. Be objective and factual about the contents of the document.',
  diff: 'You are an AI assistant helping a user understand the differences between two versions of a US Federal Government document. Compare the two versions and explain the differences in content, structure, and meaning. Be specific about what changed.'
};

// Preset-specific keywords for relevance scoring
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

// Additional instructions for each preset type
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
  score?: number;
}

// Utility function to clean HTML and extract text
function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/&[^;]+;/g, ' ') // Remove HTML entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Estimate token count (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Chunk document by HTML structure or size
function chunkDocument(content: string, targetChunkSize: number = 3000): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  // Try to split by major HTML sections first
  const sectionPattern = /<(h[1-3]|section|article)[^>]*>.*?<\/\1>/gi;
  const sections = content.match(sectionPattern);
  
  if (sections && sections.length > 1) {
    // Process HTML sections
    sections.forEach((section, index) => {
      const cleanedContent = cleanHtml(section);
      if (cleanedContent.length > 50) { // Ignore very small sections
        // If section is too large, split it further
        if (cleanedContent.length > targetChunkSize * 2) {
          const subChunks = splitBySize(cleanedContent, targetChunkSize);
          subChunks.forEach((subChunk, subIndex) => {
            chunks.push({
              content: subChunk,
              index: index * 100 + subIndex // Maintain ordering
            });
          });
        } else {
          chunks.push({
            content: cleanedContent,
            index: index
          });
        }
      }
    });
  } else {
    // Fallback: split by size with overlap
    const cleanedContent = cleanHtml(content);
    const sizeChunks = splitBySize(cleanedContent, targetChunkSize);
    sizeChunks.forEach((chunk, index) => {
      chunks.push({
        content: chunk,
        index: index
      });
    });
  }
  
  return chunks;
}

// Split text by size with overlap
function splitBySize(text: string, chunkSize: number, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    // Find the end position
    let end = start + chunkSize;
    
    // Try to break at a sentence or word boundary
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
    start = end - overlap;
  }
  
  return chunks;
}

// Calculate relevance score for a chunk
function calculateRelevance(chunk: DocumentChunk, query: string, preset: PresetType): number {
  let score = 0;
  const content = chunk.content.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Extract query keywords (simple tokenization)
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 3);
  
  // Score based on query word matches
  queryWords.forEach(word => {
    const matches = (content.match(new RegExp(word, 'gi')) || []).length;
    score += matches * 10;
  });
  
  // Score based on preset-specific keywords
  const presetWords = PRESET_KEYWORDS[preset] || [];
  presetWords.forEach(word => {
    const matches = (content.match(new RegExp(word, 'gi')) || []).length;
    score += matches * 5;
  });
  
  // Boost score for chunks near the beginning (often contain overview)
  if (chunk.index < 3) {
    score += 20;
  }
  
  // Normalize by chunk length to avoid bias toward longer chunks
  score = score / Math.log(chunk.content.length + 1);
  
  return score;
}

// Select relevant chunks within token budget
function selectRelevantChunks(
  chunks: DocumentChunk[],
  query: string,
  preset: PresetType,
  tokenBudget: number
): DocumentChunk[] {
  // Score all chunks
  const scoredChunks = chunks.map(chunk => ({
    ...chunk,
    score: calculateRelevance(chunk, query, preset)
  }));
  
  // Sort by score (highest first)
  scoredChunks.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  // Select chunks within token budget
  const selected: DocumentChunk[] = [];
  let tokenCount = 0;
  
  // Always include at least one chunk from the beginning for context
  if (chunks.length > 0 && preset !== 'diff') {
    const firstChunk = chunks[0];
    const firstChunkTokens = estimateTokens(firstChunk.content);
    if (firstChunkTokens < tokenBudget / 3) {
      selected.push(firstChunk);
      tokenCount += firstChunkTokens;
    }
  }
  
  // Add high-scoring chunks
  for (const chunk of scoredChunks) {
    // Skip if already added (e.g., first chunk)
    if (selected.some(s => s.index === chunk.index)) continue;
    
    const chunkTokens = estimateTokens(chunk.content);
    if (tokenCount + chunkTokens <= tokenBudget) {
      selected.push(chunk);
      tokenCount += chunkTokens;
      
      // Stop if we have enough diverse chunks
      if (selected.length >= 8) break;
    }
  }
  
  // Sort selected chunks by original index to maintain document flow
  selected.sort((a, b) => a.index - b.index);
  
  return selected;
}

// Assemble chunks into context for AI
function assembleContext(chunks: DocumentChunk[], documentTitle: string, preset: PresetType): string {
  if (chunks.length === 0) {
    return 'No relevant content found in the document.';
  }
  
  let context = `Here are the relevant sections from the document "${documentTitle}":\n\n`;
  
  chunks.forEach((chunk, index) => {
    context += `[Section ${index + 1}]\n${chunk.content}\n\n`;
    if (index < chunks.length - 1) {
      context += '---\n\n';
    }
  });
  
  // Add note about partial content
  context += '\n[Note: This response is based on the most relevant sections of the document. The full document may contain additional content not shown here.]';
  
  // Add preset-specific context
  if (preset === 'summarizeKeyPoints') {
    context += '\n\nThese sections were selected as most representative of the document\'s overall content, purpose, and key points.';
  } else if (preset === 'historicalContext') {
    context += '\n\nThese sections provide background and historical context.';
  }
  
  return context;
}

export const maxDuration = 60;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages, documentTitle, htmlFilePath, documentType, presetType = 'default', diffHtmlFilePaths, userId } = await request.json();

    // 'messages' should only contain user and assistant messages from the frontend
    // System message will be added here in the backend
    if (!messages || !messages.length) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    // --- AI USAGE VALIDATION ---
    let aiUsage: number | undefined = undefined;
    let isAnonymous = false;
    if (!userId) {
      // Anonymous user: check cookie
      const cookieStore = await cookies();
      aiUsage = parseInt(cookieStore.get('ai_usage')?.value || '0', 10);
      if (isNaN(aiUsage)) aiUsage = 0;
      if (aiUsage >= 3) {
        return NextResponse.json({ error: 'AI usage limit reached for anonymous users. Please log in to continue.' }, { status: 403 });
      }
      aiUsage += 1;
      isAnonymous = true;
      // We'll set the cookie before returning the response below
    }

    // --- LOGGED-IN USER LOGIC ---
    if (userId) {
      const supabase = await createClient();
      // Get subscription
      const { data: subscription, error: subError } = await supabase
        .from('subscription')
        .select('tier')
        .eq('user_id', userId)
        .maybeSingle();
      if (subError) {
        return NextResponse.json({ error: 'Failed to check subscription.' }, { status: 500 });
      }
      const isPaid = subscription && subscription.tier === 'paid';
      // Get user usage
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
      // Increment ai_interactions for all users
      const { error: updateError } = await supabase
        .from('user_usage')
        .update({ ai_interactions: aiInteractions + 1 })
        .eq('user_id', userId);
      if (updateError) {
        return NextResponse.json({ error: 'Failed to increment AI usage.' }, { status: 500 });
      }
    }

    // Get the appropriate system prompt based on the preset type
    const presetPrompt = PRESET_PROMPTS[presetType as PresetType] || PRESET_PROMPTS.default;
    const systemMessage = {
      role: 'system',
      content: `You are an AI assistant helping with information about this US federal government document: "${documentTitle}". ${presetPrompt}`
    };

    // Extract the user's query from the messages
    const userQuery = messages.length > 0 ? messages[messages.length - 1].content : '';

    // Define token budget for document content (reserving space for system prompt, messages, and response)
    const TOKEN_BUDGET = 6000; // ~24,000 characters

    // Declare storageBucket once for use in both diff and regular logic
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
      // Add more cases for other document types as needed
      default:
        storageBucket = 'bill-htmls'; // fallback
    }

    // Special handling for diff preset
    if (presetType === 'diff' && Array.isArray(diffHtmlFilePaths) && diffHtmlFilePaths.length === 2 && diffHtmlFilePaths[0] && diffHtmlFilePaths[1]) {
      // Fetch both versions
      const [content1, content2] = await Promise.all([
        fetchHtmlContent(storageBucket, diffHtmlFilePaths[0]),
        fetchHtmlContent(storageBucket, diffHtmlFilePaths[1])
      ]);
      if (content1 && content2) {
        // Process both documents
        const processed1 = processDocumentContent(content1);
        const processed2 = processDocumentContent(content2);
        
        if (processed1 && processed2) {
          // Chunk both documents
          const chunks1 = chunkDocument(processed1);
          const chunks2 = chunkDocument(processed2);
          
          // For diff, select corresponding chunks from both versions
          const halfBudget = TOKEN_BUDGET / 2;
          const selected1 = selectRelevantChunks(chunks1, userQuery || 'changes differences', presetType, halfBudget);
          const selected2 = selectRelevantChunks(chunks2, userQuery || 'changes differences', presetType, halfBudget);
          
          // Assemble diff context
          const context1 = assembleContext(selected1, `${documentTitle} (Version 1 - Most Recent)`, presetType);
          const context2 = assembleContext(selected2, `${documentTitle} (Version 2 - Previous)`, presetType);
          
          systemMessage.content += `\n\n${context1}\n\n---\n\n${context2}\n\n${PRESET_INSTRUCTIONS.diff}`;
        }
        
        const apiMessages = [systemMessage, ...messages];
        // --- Streaming OpenAI response ---
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const completion = await openai.chat.completions.create({
                model: 'gpt-5-nano-2025-08-07',
                messages: apiMessages,
                max_completion_tokens: 1000,
                stream: true,
              });
              for await (const chunk of completion) {
                const token = chunk.choices?.[0]?.delta?.content || '';
                if (token) {
                  controller.enqueue(new TextEncoder().encode(token));
                }
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          },
        });
        let response = new NextResponse(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
        if (isAnonymous && typeof aiUsage === 'number') {
          response.cookies.set('ai_usage', aiUsage.toString(), {
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
          });
        }
        return response;
      }
      // If we can't fetch both, fallback to default below
    }

    // Try to get document content from the provided HTML path
    let content = null;

    // Try to fetch HTML content if available
    if (htmlFilePath && storageBucket) {
      content = await fetchHtmlContent(storageBucket, htmlFilePath);
    }

    // Process and chunk the content if available
    if (content) {
      const processedContent = processDocumentContent(content);
      
      if (processedContent) {
        // Chunk the document
        const chunks = chunkDocument(processedContent);
        
        // Select relevant chunks based on user query and preset
        const selectedChunks = selectRelevantChunks(chunks, userQuery, presetType as PresetType, TOKEN_BUDGET);
        
        // Assemble context from selected chunks
        const assembledContext = assembleContext(selectedChunks, documentTitle, presetType as PresetType);
        
        // Add context and instructions to system message
        systemMessage.content += `\n\n${assembledContext}\n\n${PRESET_INSTRUCTIONS[presetType as PresetType]}`;
        
        // Add transparency note
        systemMessage.content += '\n\nImportant: You are viewing selected sections of a larger document. If asked about specific details not present in these sections, acknowledge this limitation and explain what you can determine from the available content.';
      }

      // Prepare messages for OpenAI API with document content
      const apiMessages = [systemMessage, ...messages];

      // --- Streaming OpenAI response ---
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const completion = await openai.chat.completions.create({
              model: 'gpt-5-mini-2025-08-07',
              messages: apiMessages,
              max_completion_tokens: 1000,
              stream: true,
            });
            for await (const chunk of completion) {
              const token = chunk.choices?.[0]?.delta?.content || '';
              if (token) {
                controller.enqueue(new TextEncoder().encode(token));
              }
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });
      let response = new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
      if (isAnonymous && typeof aiUsage === 'number') {
        response.cookies.set('ai_usage', aiUsage.toString(), {
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      }
      return response;
    } else {
      // If no content is available, use web search tool
      systemMessage.content += `\n\nNo document content is available. Please use web search to find relevant information about this document.`;

      // Prepare messages for OpenAI API with web search tool
      const apiMessages = [systemMessage, ...messages];

      // Call OpenAI API with web search tool enabled
      const completion = await openai.responses.create({
        model: 'gpt-5-mini-2025-08-07',
        input: apiMessages,
        tools: [{ type: "web_search_preview" }],
      });

      // Extract the response
      const responseMessage = completion.output_text;
      let jsonResponse = NextResponse.json({ message: responseMessage });
      if (isAnonymous && typeof aiUsage === 'number') {
        jsonResponse.cookies.set('ai_usage', aiUsage.toString(), {
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      }
      return jsonResponse;
    }
  } catch (error) {
    console.error('Error processing AI chat request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
