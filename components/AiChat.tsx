'use client';

import { useState, useRef, useEffect } from 'react';
import { FileText, Sparkles, Clock, Scale, Loader, CheckCircle2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { usePathname } from 'next/navigation';
import { getLoginUrl } from '@/utils/utils';
import { AI_FREE_USAGE_LIMIT, ANON_LIMIT } from '@/constants/onboarding';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type AgentActivityStatus = 'running' | 'completed' | 'error';

interface AgentActivity {
  id: string;
  label: string;
  status: AgentActivityStatus;
  detail?: string;
}

type AgentStreamPayload =
  | { type: 'phase'; id: string; label: string; status: AgentActivityStatus; detail?: string }
  | { type: 'tool'; id: string; label: string; status: AgentActivityStatus; detail?: string }
  | { type: 'final_answer'; content: string }
  | { type: 'error'; message: string };

// Define preset types that match the backend types
type PresetType = 'default' | 'summarizeKeyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

interface Preset {
  type: PresetType;
  label: string;
  userMessage: string;
}

const TOOL_COMPLETION_DELAY_MS = 700;

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
      type: 'summarizeKeyPoints',
      label: 'Key points',
      userMessage: `Please summarize the key points of this ${noun}.`
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const completionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const streamControllerRef = useRef<AbortController | null>(null);

  // Auth state
  const { user, loading: _authLoading, isPaidSubscriber, aiInteractions, aiLimitReached } = useAuth();

  // --- ANONYMOUS AI USAGE LOGIC ---
  const [anonAiUsage, setAnonAiUsage] = useState<number>(0);
  const [anonLimitReached, setAnonLimitReached] = useState(false);
  

  // Helper to read cookie value
  function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()!.split(';').shift() || null;
    return null;
  }

  const clearCompletionTimers = () => {
    Object.values(completionTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    completionTimersRef.current = {};
  };

  // On mount, read the ai_usage cookie if not logged in
  useEffect(() => {
    if (!user && !_authLoading) {
      const usage = parseInt(getCookie('ai_usage') || '0', 10);
      setAnonAiUsage(isNaN(usage) ? 0 : usage);
      setAnonLimitReached((isNaN(usage) ? 0 : usage) >= ANON_LIMIT);
    }
  }, [user, _authLoading]);

  useEffect(() => {
    return () => {
      if (streamControllerRef.current) {
        streamControllerRef.current.abort();
      }
      clearCompletionTimers();
    };
  }, []);

  // When a successful AI request is made as anon, increment local usage
  const incrementAnonUsage = () => {
    setAnonAiUsage((prev) => {
      const next = prev + 1;
      setAnonLimitReached(next >= ANON_LIMIT);
      return next;
    });
  };

  // Get tailored presets for the current documentType
  const PRESETS = getPresets(documentType, diffHtmlFilePaths);

  const upsertActivity = (activity: AgentActivity, options?: { delayOnComplete?: boolean }) => {
    setAgentActivities((prev) => {
      const index = prev.findIndex((item) => item.id === activity.id);
      if (index === -1) {
        return [...prev, activity];
      }
      const prevActivity = prev[index];
      if (
        options?.delayOnComplete &&
        activity.status === 'completed' &&
        prevActivity?.status === 'running'
      ) {
        if (completionTimersRef.current[activity.id]) {
          clearTimeout(completionTimersRef.current[activity.id]);
        }
        completionTimersRef.current[activity.id] = setTimeout(() => {
          setAgentActivities((innerPrev) => {
            const innerIndex = innerPrev.findIndex((item) => item.id === activity.id);
            if (innerIndex === -1) return innerPrev;
            const updatedInner = [...innerPrev];
            updatedInner[innerIndex] = { ...updatedInner[innerIndex], ...activity };
            return updatedInner;
          });
          delete completionTimersRef.current[activity.id];
        }, TOOL_COMPLETION_DELAY_MS);
        return prev;
      }
      const updated = [...prev];
      updated[index] = { ...updated[index], ...activity };
      return updated;
    });
  };

  // Function to check if the scroll is at the bottom
  const isScrollAtBottom = () => {
    if (!scrollContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // Consider it "at bottom" if within 50px of the bottom
    return scrollHeight - scrollTop - clientHeight < 50;
  };

  // Scroll to bottom of messages when new messages are added
  // Only if user hasn't manually scrolled or is already at the bottom
  useEffect(() => {
    if (!isUserScrolling || isScrollAtBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolling]);

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    // If user scrolls and they're not at the bottom, they're manually scrolling
    if (!isScrollAtBottom()) {
      setIsUserScrolling(true);
    } else {
      // If they've scrolled back to the bottom, reset the flag
      setIsUserScrolling(false);
    }
  };

  const [subscribing, setSubscribing] = useState(false);

  const pathname = usePathname();

  // Function to handle sending a message to the AI API
  const sendMessageToApi = async (messagesToSend: Message[], presetType: PresetType = 'default') => {
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);
    clearCompletionTimers();
    setAgentActivities([{
      id: 'thinking',
      label: 'Thinking',
      status: 'running',
      detail: 'Preparing analysis...'
    }]);

    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
    }
    const controller = new AbortController();
    streamControllerRef.current = controller;

    const handleActivityPayload = (payload: Extract<AgentStreamPayload, { type: 'phase' | 'tool' }>) => {
      upsertActivity({
        id: payload.id,
        label: payload.label,
        status: payload.status,
        detail: payload.detail
      }, { delayOnComplete: payload.status === 'completed' });
    };

    const handleFinalAnswer = (content: string) => {
      setMessages(prev => [...prev, { role: 'assistant', content }]);
      if (!user) {
        incrementAnonUsage();
      }
      clearCompletionTimers();
      setAgentActivities([]);
      setIsStreaming(false);
    };

    try {
      const body: any = {
        messages: messagesToSend,
        documentType,
        documentId,
        documentTitle,
        htmlFilePath,
        presetType,
        userId: user?.id,
      };
      if (presetType === 'diff' && diffHtmlFilePaths && diffHtmlFilePaths.length === 2 && diffHtmlFilePaths[0] && diffHtmlFilePaths[1]) {
        body.diffHtmlFilePaths = diffHtmlFilePaths;
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (!user && response.status === 403) {
          setAnonLimitReached(true);
        }
        let message = `Error: ${response.status}`;
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          }
        } catch {}
        throw new Error(message);
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.includes('text/event-stream')) {
        const data = await response.json().catch(() => ({}));
        const fallbackMessage =
          typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
            ? data.error
            : 'No response returned.';
        setMessages(prev => [...prev, { role: 'assistant', content: fallbackMessage }]);
        if (!user) {
          incrementAnonUsage();
        }
        setAgentActivities([]);
        clearCompletionTimers();
        upsertActivity({
          id: 'thinking',
          label: 'Thinking',
          status: 'completed',
          detail: 'Responded with available information.'
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      setIsStreaming(true);

      const handlePayload = (payload: AgentStreamPayload) => {
        if (payload.type === 'phase' || payload.type === 'tool') {
          handleActivityPayload(payload);
        } else if (payload.type === 'final_answer') {
          handleFinalAnswer(payload.content);
        } else if (payload.type === 'error') {
          setError(payload.message || 'Agent error');
          setIsStreaming(false);
          upsertActivity({
            id: 'agent-error',
            label: 'Agent error',
            status: 'error',
            detail: payload.message
          });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const chunk = buffer.slice(0, boundaryIndex).trim();
          buffer = buffer.slice(boundaryIndex + 2);
          if (chunk) {
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const dataLine = line.slice(5).trim();
              if (!dataLine) continue;
              try {
                const payload = JSON.parse(dataLine) as AgentStreamPayload;
                handlePayload(payload);
              } catch (parseErr) {
                console.error('Failed to parse stream chunk', parseErr, dataLine);
              }
            }
          }
          boundaryIndex = buffer.indexOf('\n\n');
        }
      }

      const remaining = buffer.trim();
      if (remaining.startsWith('data:')) {
        try {
          handlePayload(JSON.parse(remaining.slice(5).trim()) as AgentStreamPayload);
        } catch (parseErr) {
          console.error('Failed to parse remaining stream chunk', parseErr, remaining);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Error calling AI API:', err);
      setError('Failed to get a response. Please try again.');
      upsertActivity({
        id: 'thinking',
        label: 'Thinking',
        status: 'error',
        detail: 'Request failed.'
      });
      upsertActivity({
        id: 'agent-error',
        label: 'Agent error',
        status: 'error',
        detail: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
        setIsLoading(false);
        setIsStreaming(false);
        clearCompletionTimers();
        setAgentActivities([]);
      }
    }
  };

  // Handle preset button click
  const handlePresetClick = async (preset: Preset) => {
    if (isLoading || aiLimitReached) return;
    // Create a user message with the preset's user message
    const userMessage: Message = { role: 'user', content: preset.userMessage };
    setMessages(prev => [...prev, userMessage]);
    setIsUserScrolling(false);
    await sendMessageToApi([userMessage], preset.type);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || aiLimitReached) return;
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsUserScrolling(false);
    await sendMessageToApi([...messages, userMessage]);
  };

  // Determine button text based on documentType
  let _buttonText = 'Learn about this document';
  switch (documentType) {
    case 'bill':
      _buttonText = 'Learn about this bill';
      break;
    case 'law':
      _buttonText = 'Learn about this law';
      break;
    case 'agencyDocument':
      _buttonText = 'Learn about this agency document';
      break;
    case 'opinion':
      _buttonText = 'Learn about this opinion';
      break;
    case 'executiveOrder':
      _buttonText = 'Learn about this executive order';
      break;
    default:
      _buttonText = 'Learn about this document';
  }

  // Determine if AI should be locked for this user (either logged in and at limit, or anon and at limit)
  const aiLocked = user
    ? aiLimitReached
    : anonLimitReached;

  // Panel layout (always open, not floating)
  return (
    <div 
      className={`w-full flex flex-col bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden ${!height ? 'flex-1' : ''}`}
      style={height ? { height } : {}}
    >
      {/* Header */}
      <div className="p-2 bg-primary text-white flex justify-between items-center rounded-t-xl">
        <h2 className="text-base font-semibold">GovSource Assistant</h2>
        {/* Show usage counter for free users in header */}
        {!isPaidSubscriber && user && (
          <span className="ml-2 text-xs text-gray-200 bg-primary/30 px-2 py-0.5 rounded self-center">{aiInteractions}/{AI_FREE_USAGE_LIMIT} free uses</span>
        )}
        {/* Show usage counter for anonymous users */}
        {!user && !_authLoading && (
          <span className="ml-2 text-xs text-gray-200 bg-primary/30 px-2 py-0.5 rounded self-center">{anonAiUsage}/{ANON_LIMIT} uses before sign up</span>
        )}
      </div>

      {/* Info indicator if htmlFilePath is not defined */}
      {!htmlFilePath && (
        <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs border-b border-primary/20">
          <span className="text-xs">The assistant cannot process this document. It will search the web to find additional information.</span>
        </div>
      )}
      {/* Info indicator if htmlFilePath is defined */}
      {htmlFilePath && (
        <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs border-b border-primary/20">
          <span className="text-xs">The assistant will objectively analyze the text and information here. No other sources are considered.</span>
        </div>
      )}

      {/* Preset buttons (top, with extra spacing) - always visible, disabled if not paid subscriber */}
      <div className="p-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-1.5 justify-center">
        {PRESETS.map((preset) => {
          let IconComponent = null;
          switch (preset.type) {
            case 'summarizeKeyPoints':
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
          // Only lock if aiLocked or not signed in and at limit
          const isLocked = aiLocked || (!user && !_authLoading && anonLimitReached);
          return (
            <Button
              key={preset.label}
              onClick={() => {
                if (!isLocked) handlePresetClick(preset);
              }}
              disabled={isLoading || isLocked}
              variant="outline"
              className={`px-2 py-1 text-xs flex items-center gap-1 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ borderRadius: '0.5rem' }}
              title={(!user || _authLoading) ? 'Sign in to use AI' : (aiLocked ? 'Upgrade to continue using AI' : undefined)}
            >
              <IconComponent className="h-3.5 w-3.5" />
              {preset.label}
            </Button>
          );
        })}
      </div>

      {/* Messages (scrollable area) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 bg-gray-50" ref={scrollContainerRef} onScroll={handleScroll}>
        {/* Show sign in prompt if anon and at limit */}
        {(!user && !_authLoading && anonLimitReached) ? (
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Sign in to continue using the AI Assistant</p>
              <a
                href={getLoginUrl(pathname)}
                className="inline-block px-3 py-1.5 bg-primary text-white font-medium hover:bg-primary/90 transition text-sm"
                style={{ borderRadius: '0.375rem' }}
              >
                Sign in
              </a>
            </div>
          </div>
        ) : aiLocked ? (
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">You have reached your free AI usage limit.</p>
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
                  } catch (_err) {
                    alert('Failed to create checkout session.');
                  } finally {
                    setSubscribing(false);
                  }
                }}
              >
                {subscribing ? 'Redirecting...' : 'Upgrade to Pro'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat messages for users who have not reached their limit or are paid subscribers */}
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
                  <div className="prose prose-sm prose-gray max-w-none 
                    prose-p:my-2 prose-p:leading-normal
                    prose-ul:my-2 prose-ol:my-2
                    prose-li:my-1 prose-li:leading-normal
                    prose-headings:my-3 prose-headings:font-semibold
                    prose-strong:font-semibold
                    prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-gray-100
                    prose-pre:bg-gray-100 prose-pre:text-xs
                    prose-blockquote:border-gray-300 prose-blockquote:text-gray-700
                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                    <ReactMarkdown>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {agentActivities.length > 0 && (isLoading || isStreaming) && (
              <div className="flex justify-start">
                <div className="max-w-[85%] text-sm text-primary/80 leading-snug">
                  <div className="space-y-1">
                    {agentActivities.map((activity, index) => {
                      const isThinking = activity.id === 'thinking';
                      const isPrimary = !isThinking && index === 0;
                      const textClass = isPrimary
                        ? 'text-base font-semibold text-primary/90'
                        : 'text-sm font-medium text-primary/80';
                      const statusIcon =
                        activity.status === 'completed'
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          : activity.status === 'error'
                          ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                          : <Loader className="h-3 w-3 text-primary/60 animate-spin" />;
                      return (
                        <div key={activity.id}>
                          <div className="flex items-center gap-2">
                            <span className={textClass}>{activity.label}</span>
                            {statusIcon}
                          </div>
                          {activity.detail && (
                            <p className="text-xs text-primary/60 mt-0.5 truncate">{activity.detail}</p>
                          )}
                        </div>
                      );
                    })}
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
            disabled={isLoading || aiLocked || (!user && !_authLoading && anonLimitReached) || _authLoading}
            style={{ borderRadius: '0.5rem' }}
            className="h-9"
          />
          <Button
            type="submit"
            className="px-3 py-1.5 text-white text-sm h-9"
            style={{ borderRadius: '0.5rem' }}
            disabled={isLoading || !input.trim() || aiLocked || (!user && !_authLoading && anonLimitReached) || _authLoading}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
