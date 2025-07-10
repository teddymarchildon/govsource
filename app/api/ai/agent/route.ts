import { NextResponse } from 'next/server';
import { Agent, Tool } from '@openai/agents';
import { fetchHtmlContent } from '@/utils/documentUtils';
import OpenAI from 'openai';

// Tool: Fetch document content from Supabase storage
const fetchDocument: Tool = {
  name: 'fetchDocument',
  description: 'Fetches the full raw content of a document by ID and type.',
  parameters: {
    documentId: { type: 'string', description: 'The document ID' },
    documentType: { type: 'string', description: 'The type of document' }
  },
  execute: async ({ documentId, documentType }) => {
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
    // For demo, assume htmlFilePath = `${documentId}.html`
    const htmlFilePath = `${documentId}.html`;
    const content = await fetchHtmlContent(storageBucket, htmlFilePath);
    return { rawContent: content || '' };
  }
};

// Tool: Summarize the full document (calls OpenAI)
const summarizeDocument: Tool = {
  name: 'summarizeDocument',
  description: 'Summarizes or answers a question about the full document content.',
  parameters: {
    rawContent: { type: 'string', description: 'The full document content' },
    query: { type: 'string', description: 'The user\'s question' }
  },
  execute: async ({ rawContent, query }) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `The user asked: "${query}"\n\nHere is the full document content:\n\n${rawContent}\n\nPlease answer the user\'s question as clearly and concisely as possible, using only the information in the document.`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert at analyzing government documents.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.5
    });
    return { answer: completion.choices[0].message.content };
  }
};

// Create the agent
const agent = new Agent({
  name: 'government-document-agent',
  model: 'gpt-4o',
  tools: [fetchDocument, summarizeDocument],
  instructions: 'You are an expert at analyzing government documents. Use the available tools to fetch and summarize documents as needed to answer the user\'s question.'
});

export async function POST(req: Request) {
  try {
    const { userQuery, documentId, documentType } = await req.json();
    if (!userQuery || !documentId || !documentType) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    // Compose the initial message
    const messages = [
      { role: 'user', content: userQuery }
    ];

    // Run the agent
    const result = await agent.run({
      messages,
      toolsInput: { documentId, documentType }
    });

    return NextResponse.json({
      answer: result.output,
      toolCalls: result.toolCalls
    });
  } catch (err) {
    console.error('Agentic endpoint error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
} 