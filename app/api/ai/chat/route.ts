import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { fetchHtmlContent, processDocumentContent, truncateContent } from '@/utils/documentUtils';

// Define preset types and their corresponding system prompts
type PresetType = 'default' | 'summarize' | 'keyPoints' | 'historicalContext' | 'prosAndCons';

const PRESET_PROMPTS: Record<PresetType, string> = {
  default: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Answer questions based on the document content. Be objective and factual about the contents of the document.',
  summarize: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Provide a concise summary of the document, highlighting its main purpose and potential impact. Keep your summary clear and objective. Be objective and factual about the contents of the government action.',
  keyPoints: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Extract and explain the most important points from this document. Focus on the provisions that have the most significant impact or introduce notable changes. Be objective and factual about the contents of the document.',
  historicalContext: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Provide historical context for this document. Explain how it relates to previous legislation, what problems it aims to solve, and how it fits into the broader legislative history on this topic. Be objective and factual about the contents of the document.',
  prosAndCons: 'You are an AI assistant helping a user understand information about US Federal Government documents, legislation, and executive actions. Analyze the potential benefits and drawbacks of this document. Present a balanced view of arguments for and against its provisions, considering different stakeholder perspectives. Be objective and factual about the contents of the document.'
};

export const maxDuration = 60;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages, documentTitle, htmlFilePath, documentType, presetType = 'default' } = await request.json();

    // 'messages' should only contain user and assistant messages from the frontend
    // System message will be added here in the backend
    if (!messages || !messages.length) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    // Get the appropriate system prompt based on the preset type
    const presetPrompt = PRESET_PROMPTS[presetType as PresetType] || PRESET_PROMPTS.default;

    // Create a system message with context about the document
    const systemMessage = {
      role: 'system',
      content: `You are an AI assistant helping with information about this US federal government document: "${documentTitle}". ${presetPrompt}`
    };

    // Try to get document content from the provided HTML path
    let content = null;

    // Determine storage bucket based on documentType
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

    // Try to fetch HTML content if available
    if (htmlFilePath && storageBucket) {
      content = await fetchHtmlContent(storageBucket, htmlFilePath);
    }

    // Process and truncate the content if available
    if (content) {
      content = processDocumentContent(content);
      content = truncateContent(content, 50000); // Limit to ~50K chars to stay within token limits
      systemMessage.content += `\n\nHere is the content of the document:\n\n${content}`;

      // Prepare messages for OpenAI API with document content
      const apiMessages = [systemMessage, ...messages];

      // --- Streaming OpenAI response ---
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: apiMessages,
              temperature: 0.7,
              max_tokens: 1000,
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
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    } else {
      // If no content is available, use web search tool
      systemMessage.content += `\n\nNo document content is available. Please use web search to find relevant information about this document.`;

      // Prepare messages for OpenAI API with web search tool
      const apiMessages = [systemMessage, ...messages];

      // Call OpenAI API with web search tool enabled
      const completion = await openai.responses.create({
        model: 'gpt-4o',
        input: apiMessages,
        tools: [{ type: "web_search_preview" }],
      });

      // Extract the response
      const responseMessage = completion.output_text;
      return NextResponse.json({ message: responseMessage });
    }
  } catch (error) {
    console.error('Error processing AI chat request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
