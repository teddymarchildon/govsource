'use client';

import { useState, useRef, useEffect } from 'react';
import { X, FileText, Sparkles, Clock, Scale, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { usePathname } from 'next/navigation';
import { getLoginUrl } from '@/utils/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Define preset types that match the backend types
type PresetType = 'default' | 'summarize' | 'keyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

interface Preset {
  type: PresetType;
  label: string;
  userMessage: string;
}

// Helper to get the noun for the document type
function getDocumentNoun(documentType: AiChatProps['documentType']) {
  switch (documentType) {
    case 'bill':
      return 'bill';
    case 'law':
      return 'law';
    case 'agencyDocument':
      return 'agency document';
    case 'opinion':
      return 'opinion';
    case 'executiveOrder':
      return 'executive order';
    default:
      return 'document';
  }
}

// Function to generate tailored presets based on documentType
function getPresets(documentType: AiChatProps['documentType'], diffHtmlFilePaths?: (string | undefined)[]): Preset[] {
  const noun = getDocumentNoun(documentType);
  const presets: Preset[] = [
    {
      type: 'summarize',
      label: 'Summarize',
      userMessage: `Please summarize this ${noun} for me.`
    },
    {
      type: 'keyPoints',
      label: 'Key Points',
      userMessage: `What are the key points of this ${noun}?`
    },
    {
      type: 'historicalContext',
      label: 'Historical Context',
      userMessage: `What is the historical context of this ${noun}?`
    },
    {
      type: 'prosAndCons',
      label: 'Pros & Cons',
      userMessage: `What are the pros and cons of this ${noun}?`
    }
  ];
  // Add diff preset if bill/law and two valid htmls
  if ((documentType === 'bill' || documentType === 'law') && Array.isArray(diffHtmlFilePaths) && diffHtmlFilePaths.length === 2 && diffHtmlFilePaths[0] && diffHtmlFilePaths[1]) {
    presets.unshift({
      type: 'diff',
      label: 'Difference between versions',
      userMessage: `What are the differences between the two most recent versions of this ${noun}?`
    });
  }
  return presets;
}

interface AiChatProps {
  documentType: 'bill' | 'law' | 'agencyDocument' | 'opinion' | 'executiveOrder';
  documentId: string;
  documentTitle: string;
  htmlFilePath?: string;
  pdfFilePath?: string;
  diffHtmlFilePaths?: (string | undefined)[];
  height?: string;
}

export default function AiChat({
  documentType,
  documentId,
  documentTitle,
  htmlFilePath,
  diffHtmlFilePaths,
  height = '600px'
}: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth state
  const { user, loading: authLoading, isPaidSubscriber } = useAuth();

  // Get tailored presets for the current documentType
  const PRESETS = getPresets(documentType, diffHtmlFilePaths);

  // Scroll to bottom of messages when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [subscribing, setSubscribing] = useState(false);

  const pathname = usePathname();

  // Function to handle sending a message to the AI API
  const sendMessageToApi = async (messagesToSend: Message[], presetType: PresetType = 'default') => {
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    try {
      // We'll let the API handle content fetching
      const documentContent = null;

      // For diff preset, send the two html file paths
      const body: any = {
        messages: messagesToSend,
        documentContent,
        documentType,
        documentId,
        documentTitle,
        htmlFilePath,
        presetType,
      };
      if (presetType === 'diff' && diffHtmlFilePaths && diffHtmlFilePaths.length === 2 && diffHtmlFilePaths[0] && diffHtmlFilePaths[1]) {
        body.diffHtmlFilePaths = diffHtmlFilePaths;
      }

      // Call the API endpoint with the messages and document content
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      // Check if the response is a stream (text/plain) or JSON (web search fallback)
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        // Web search fallback (non-streaming)
        const data = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        // Streaming response
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        let assistantMessage = '';
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        let done = false;
        let firstChunk = true;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            if (firstChunk) {
              setIsStreaming(true);
              firstChunk = false;
            }
            const chunk = new TextDecoder().decode(value);
            assistantMessage += chunk;
            setMessages(prev => {
              // Update the last assistant message in the array
              const updated = [...prev];
              // Only update if the last message is assistant
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
                updated[updated.length - 1] = { role: 'assistant', content: assistantMessage };
              }
              return updated;
            });
          }
        }
        setIsStreaming(false);
      }
    } catch (err) {
      console.error('Error calling AI API:', err);
      setError('Failed to get a response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle preset button click
  const handlePresetClick = (preset: Preset) => {
    if (isLoading) return;

    // Create a user message with the preset's user message
    const userMessage: Message = { role: 'user', content: preset.userMessage };

    // Update the messages state with the user message
    setMessages(prev => [...prev, userMessage]);

    // Send the message to the API with the preset type
    sendMessageToApi([userMessage], preset.type);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // For regular user input, we just send the user message and previous messages
    await sendMessageToApi([...messages, userMessage]);
  };

  // Determine button text based on documentType
  let buttonText = 'Learn about this document';
  switch (documentType) {
    case 'bill':
      buttonText = 'Learn about this bill';
      break;
    case 'law':
      buttonText = 'Learn about this law';
      break;
    case 'agencyDocument':
      buttonText = 'Learn about this agency document';
      break;
    case 'opinion':
      buttonText = 'Learn about this opinion';
      break;
    case 'executiveOrder':
      buttonText = 'Learn about this executive order';
      break;
    default:
      buttonText = 'Learn about this document';
  }

  // Panel layout (always open, not floating)
  return (
    <div 
      className={`w-full flex flex-col bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden ${!height ? 'flex-1' : ''}`}
      style={height ? { height } : {}}
    >
      {/* Header */}
      <div className="p-2 bg-primary text-white flex justify-between items-center rounded-t-xl">
        <h2 className="text-base font-semibold">GovSource Assistant</h2>
      </div>

      {/* Info indicator if htmlFilePath is not defined */}
      {!htmlFilePath && (
        <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs border-b border-primary/20">
          <svg className="h-3 w-3 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
          <span className="text-xs">The assistant cannot process this document. It will search the web to find additional information.</span>
        </div>
      )}
      {/* Info indicator if htmlFilePath is defined */}
      {htmlFilePath && (
        <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs border-b border-primary/20">
          <svg className="h-3 w-3 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
          <span className="text-xs">The assistant will objectively analyze the text and information here. No other sources are considered.</span>
        </div>
      )}

      {/* Preset buttons (top, with extra spacing) - always visible, disabled if not paid subscriber */}
      <div className="p-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-1.5 justify-center">
        {PRESETS.map((preset) => {
          let IconComponent = null;
          switch (preset.type) {
            case 'summarize':
              IconComponent = FileText;
              break;
            case 'keyPoints':
              IconComponent = Sparkles;
              break;
            case 'historicalContext':
              IconComponent = Clock;
              break;
            case 'prosAndCons':
              IconComponent = Scale;
              break;
            case 'diff':
              IconComponent = FileText;
              break;
            default:
              IconComponent = FileText;
          }
          const isLocked = !isPaidSubscriber;
          return (
            <Button
              key={preset.label}
              onClick={() => !isLocked && handlePresetClick(preset)}
              disabled={isLoading || isLocked}
              variant="outline"
              className={`px-2 py-1 text-xs flex items-center gap-1 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ borderRadius: '0.5rem' }}
              title={isLocked ? 'Subscribe to unlock this feature' : undefined}
            >
              <IconComponent className="h-3.5 w-3.5" />
              {preset.label}
            </Button>
          );
        })}
      </div>

      {/* Messages (scrollable area) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 bg-gray-50">
        {(!user && !authLoading) ? (
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Sign in to use the AI Assistant</p>
              <a
                href={getLoginUrl(pathname)}
                className="inline-block px-3 py-1.5 bg-primary text-white font-medium hover:bg-primary/90 transition text-sm"
                style={{ borderRadius: '0.375rem' }}
              >
                Sign in
              </a>
            </div>
          </div>
        ) : !isPaidSubscriber ? (
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Subscribe to use the AI Assistant</p>
              <Button
                className="text-sm"
                style={{ borderRadius: '0.5rem' }}
                variant="default"
                disabled={subscribing || !user}
                onClick={async () => {
                  if (!user) return;
                  setSubscribing(true);
                  try {
                    const redirectUrl = window.location.href;
                    const res = await fetch('/api/create-checkout-session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user.id, redirectUrl }),
                    });
                    const data = await res.json();
                    if (data.url) {
                      window.location.href = data.url;
                    } else {
                      alert('Failed to create checkout session.');
                    }
                  } catch (err) {
                    alert('Failed to create checkout session.');
                  } finally {
                    setSubscribing(false);
                  }
                }}
              >
                {subscribing ? 'Redirecting...' : 'Subscribe'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat messages for paid subscribers */}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-2 ${
                    message.role === 'user'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                  style={{ borderRadius: '0.5rem' }}
                >
                  <div className="whitespace-pre-wrap text-sm markdown-content prose">
                    <ReactMarkdown>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && !isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg p-2 bg-white border border-gray-200" style={{ borderRadius: '0.5rem' }}>
                  <div className="flex items-center justify-center">
                    <Loader className="h-4 w-4 text-primary animate-spin" />
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-center">
                <div className="max-w-[85%] rounded-lg p-2 bg-red-100 text-red-800 text-sm" style={{ borderRadius: '0.5rem' }}>
                  <p>{error}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input form (always visible at bottom) */}
      <form onSubmit={handleSubmit} className="p-2 bg-white border-t border-gray-200">
        <div className="flex space-x-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${documentTitle || 'this document'}...`}
            disabled={isLoading || (!user && !authLoading) || !isPaidSubscriber}
            style={{ borderRadius: '0.5rem' }}
            className="h-9"
          />
          <Button
            type="submit"
            className="px-3 py-1.5 text-white text-sm h-9"
            style={{ borderRadius: '0.5rem' }}
            disabled={isLoading || !input.trim() || (!user && !authLoading) || !isPaidSubscriber}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
