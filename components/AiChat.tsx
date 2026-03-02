'use client';

import { useState, useRef, useEffect } from 'react';
import { FileText, Sparkles, Clock, Scale, Loader, CheckCircle2, XCircle, Copy, Check, ArrowUp, Square } from 'lucide-react';
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
  citations?: CitationMeta[];
  runLog?: Activity[];
  runState?: RunState;
}

interface Activity {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'error';
  detail?: string;
}

type RunState = 'completed' | 'stopped' | 'error' | 'partial';

interface CitationMeta {
  label: string;
  section: number;
  page?: number;
  searchText?: string;
}

type PresetType = 'default' | 'summarizeKeyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

interface Preset {
  type: PresetType;
  label: string;
  icon: typeof FileText;
  getMessage: (noun: string) => string;
}

function extractSectionCitations(content: string): string[] {
  const matches = content.match(/\[Section\s+\d+\]/gi) || [];
  return [...new Set(matches.map(citation => citation.replace(/\s+/g, ' ').trim()))];
}

function upsertActivity(list: Activity[], activity: Activity): Activity[] {
  const idx = list.findIndex(a => a.id === activity.id);
  if (idx === -1) return [...list, activity];
  const updated = [...list];
  updated[idx] = { ...updated[idx], ...activity };
  return updated;
}

const PRESETS: Preset[] = [
  { type: 'summarizeKeyPoints', label: 'Key points', icon: Sparkles, getMessage: n => `Please summarize the key points of this ${n}.` },
  { type: 'historicalContext', label: 'Historical Context', icon: Clock, getMessage: n => `What is the historical context of this ${n}?` },
  { type: 'prosAndCons', label: 'Pros & Cons', icon: Scale, getMessage: n => `What are the pros and cons of this ${n}?` },
];

const DOCUMENT_NOUNS: Record<string, string> = {
  bill: 'bill',
  law: 'law',
  agencyDocument: 'agency document',
  opinion: 'opinion',
  executiveOrder: 'executive order',
};

interface AiChatProps {
  documentType: 'bill' | 'law' | 'agencyDocument' | 'opinion' | 'executiveOrder';
  documentId: string;
  documentTitle: string;
  htmlFilePath?: string;
  pdfFilePath?: string;
  diffHtmlFilePaths?: (string | undefined)[];
  height?: string;
  onCitationClick?: (citation: CitationMeta) => void;
}

export default function AiChat({
  documentType,
  documentId,
  documentTitle,
  htmlFilePath,
  diffHtmlFilePaths,
  height = '600px',
  onCitationClick
}: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<CitationMeta[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { user, loading: authLoading, isPaidSubscriber, aiInteractions, aiLimitReached } = useAuth();
  const pathname = usePathname();

  // Anonymous usage tracking
  const [anonUsage, setAnonUsage] = useState(0);
  const anonLimitReached = anonUsage >= ANON_LIMIT;

  useEffect(() => {
    if (!user && !authLoading) {
      const usage = parseInt(document.cookie.match(/ai_usage=(\d+)/)?.[1] || '0', 10);
      setAnonUsage(isNaN(usage) ? 0 : usage);
    }
  }, [user, authLoading]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Auto-scroll when messages or streaming content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const noun = DOCUMENT_NOUNS[documentType] || 'document';
  const aiLocked = user ? aiLimitReached : anonLimitReached;
  const sourceUnavailable = !htmlFilePath;

  // Build presets list, adding diff preset if applicable
  const presets = [...PRESETS];
  if ((documentType === 'bill' || documentType === 'law') && diffHtmlFilePaths?.length === 2 && diffHtmlFilePaths[0] && diffHtmlFilePaths[1]) {
    presets.unshift({
      type: 'diff',
      label: 'Difference between versions',
      icon: FileText,
      getMessage: n => `What are the differences between the two most recent versions of this ${n}?`
    });
  }

  const sendMessage = async (messagesToSend: Message[], presetType: PresetType = 'default') => {
    let accumulatedContent = '';
    let pendingCitations: CitationMeta[] = [];
    let didCommitMessage = false;
    let runActivities: Activity[] = [{ id: 'understanding', label: 'Understanding request', status: 'running', detail: 'Analyzing your question' }];

    const applyActivityUpdate = (activity: Activity) => {
      runActivities = upsertActivity(runActivities, activity);
      setActivities(runActivities);
    };
    const commitAssistantMessage = (content: string, runState: RunState) => {
      setMessages(prev => [...prev, { role: 'assistant', content, citations: pendingCitations, runLog: runActivities, runState }]);
      didCommitMessage = true;
    };

    setIsLoading(true);
    setError(null);
    setStreamingContent('');
    setStreamingCitations([]);
    setActivities(runActivities);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const body: Record<string, any> = {
        messages: messagesToSend,
        documentType,
        documentId,
        documentTitle,
        htmlFilePath,
        presetType,
      };

      if (presetType === 'diff' && diffHtmlFilePaths?.length === 2) {
        body.diffHtmlFilePaths = diffHtmlFilePaths;
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (!user && response.status === 403) setAnonUsage(ANON_LIMIT);
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Error: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.includes('text/event-stream')) {
        const data = await response.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: 'assistant', content: data.message || data.error || 'No response.' }]);
        if (!user) setAnonUsage(u => u + 1);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);

          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());

              if (payload.type === 'phase' || payload.type === 'tool') {
                applyActivityUpdate({ id: payload.id, label: payload.label, status: payload.status, detail: payload.detail });
              } else if (payload.type === 'text_delta') {
                accumulatedContent += payload.delta;
                setStreamingContent(accumulatedContent);
              } else if (payload.type === 'citations') {
                const nextCitations = Array.isArray(payload.citations) ? payload.citations : [];
                pendingCitations = nextCitations;
                setStreamingCitations(nextCitations);
              } else if (payload.type === 'stream_end') {
                if (accumulatedContent.trim()) {
                  commitAssistantMessage(accumulatedContent, 'completed');
                  if (!user) setAnonUsage(u => u + 1);
                }
                setStreamingContent('');
                setStreamingCitations([]);
              } else if (payload.type === 'error') {
                applyActivityUpdate({ id: 'run_error', label: 'Run failed', status: 'error', detail: payload.message });
                setError(payload.message);
              }
            } catch {}
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        applyActivityUpdate({ id: 'run_stopped', label: 'Stopped by user', status: 'completed', detail: 'Generation stopped' });
        if (!didCommitMessage) {
          if (accumulatedContent.trim()) {
            commitAssistantMessage(accumulatedContent, 'stopped');
          } else {
            commitAssistantMessage('Generation stopped.', 'stopped');
          }
        }
      } else {
        console.error('AI API error:', err);
        applyActivityUpdate({ id: 'run_error', label: 'Run failed', status: 'error', detail: 'Failed to generate a full response' });
        setError('Failed to get a response. Please try again.');
        if (!didCommitMessage && accumulatedContent.trim()) {
          commitAssistantMessage(accumulatedContent, 'partial');
        }
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
        setStreamingContent('');
        setStreamingCitations([]);
        setActivities([]);
      }
    }
  };

  const handlePresetClick = (preset: Preset) => {
    if (isLoading || aiLocked || sourceUnavailable) return;
    const userMessage: Message = { role: 'user', content: preset.getMessage(noun) };
    setMessages(prev => [...prev, userMessage]);
    sendMessage([...messages, userMessage], preset.type);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || aiLocked || sourceUnavailable) return;
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    sendMessage([...messages, userMessage]);
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const renderCitations = (citations: CitationMeta[] | undefined, fallbackContent: string) => {
    const fallback = extractSectionCitations(fallbackContent).map((raw) => {
      const section = parseInt(raw.match(/\d+/)?.[0] || '', 10);
      return {
        label: raw.replace('[', '').replace(']', ''),
        section: Number.isFinite(section) ? section : -1,
      };
    }).filter(c => c.section > 0);

    const resolved = citations && citations.length > 0 ? citations : fallback;
    if (!resolved.length) return null;

    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {resolved.map((citation) => (
          <button
            key={`${citation.label}-${citation.section}`}
            type="button"
            onClick={() => onCitationClick?.(citation)}
            disabled={!onCitationClick}
            className={`inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary ${
              onCitationClick ? 'hover:bg-primary/10' : 'cursor-default'
            }`}
            title={onCitationClick ? `Jump to ${citation.label}` : citation.label}
          >
            {citation.label}
          </button>
        ))}
      </div>
    );
  };

  const [subscribing, setSubscribing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(current => (current === messageId ? null : current)), 1500);
    } catch (copyError) {
      console.error('Failed to copy message:', copyError);
    }
  };

  const renderRunStateBadge = (state: RunState | undefined) => {
    if (!state) return null;
    const config: Record<RunState, { label: string; className: string }> = {
      completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
      stopped: { label: 'Stopped', className: 'bg-amber-100 text-amber-700 border-amber-300' },
      error: { label: 'Failed', className: 'bg-red-100 text-red-700 border-red-300' },
      partial: { label: 'Partial', className: 'bg-orange-100 text-orange-700 border-orange-300' },
    };
    const entry = config[state];
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${entry.className}`}>{entry.label}</span>;
  };

  const handleUpgrade = async () => {
    if (!user) return;
    setSubscribing(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, redirectUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert('Failed to create checkout session.');
    } catch {
      alert('Failed to create checkout session.');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div
      className={`w-full flex flex-col bg-card rounded-2xl shadow-lg border border-border overflow-hidden ${!height ? 'flex-1' : ''}`}
      style={height ? { height } : {}}
    >
      {/* Header */}
      <div className="px-3 py-2.5 bg-card/95 border-b border-border flex justify-between items-center">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">GovSource Assistant</h2>
        {!isPaidSubscriber && user && (
          <span className="ml-2 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
            {aiInteractions}/{AI_FREE_USAGE_LIMIT} free uses
          </span>
        )}
        {!user && !authLoading && (
          <span className="ml-2 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
            {anonUsage}/{ANON_LIMIT} uses before sign up
          </span>
        )}
      </div>

      {/* Document info banner */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 text-muted-foreground text-[11px] border-b border-border">
        <span>
          {htmlFilePath
            ? 'The assistant will objectively analyze the text and information here. No other sources are considered.'
            : 'The assistant cannot process this document because source text is unavailable.'}
        </span>
      </div>

      {/* Preset buttons */}
      <div className="px-2.5 py-2 bg-card border-b border-border">
        <div className="flex flex-wrap justify-center gap-1.5">
        {presets.map(preset => (
          <Button
            key={preset.type}
            onClick={() => handlePresetClick(preset)}
            disabled={isLoading || aiLocked || authLoading || sourceUnavailable}
            variant="outline"
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] flex items-center gap-1 border-border bg-card hover:bg-muted/80 ${(aiLocked || sourceUnavailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <preset.icon className="h-3.5 w-3.5" />
            {preset.label}
          </Button>
        ))}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-muted/30" ref={scrollContainerRef}>
        {sourceUnavailable ? (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">AI Assistant is unavailable for this document because no source text is attached.</p>
          </div>
        ) : !user && !authLoading && anonLimitReached ? (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">Sign in to continue using the AI Assistant</p>
            <a
              href={getLoginUrl(pathname)}
              className="inline-block px-3 py-1.5 bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition text-sm rounded-full"
            >
              Sign in
            </a>
          </div>
        ) : aiLocked ? (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">You have reached your free AI usage limit.</p>
            <Button
              className="text-sm rounded-full"
              variant="default"
              disabled={subscribing || !user}
              onClick={handleUpgrade}
            >
              {subscribing ? 'Redirecting...' : 'Upgrade to Pro'}
            </Button>
          </div>
        ) : (
          <>
            {messages.map((message, i) => (
              <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`group max-w-[88%] rounded-2xl p-2.5 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground border border-primary/20'
                      : 'bg-card text-foreground border border-border shadow-sm'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="mb-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(message.content, `message-${i}`)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                        title={copiedMessageId === `message-${i}` ? 'Copied' : 'Copy text'}
                        aria-label={copiedMessageId === `message-${i}` ? 'Copied' : 'Copy text'}
                      >
                        {copiedMessageId === `message-${i}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-muted">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-primary-foreground">
                      {message.content}
                    </div>
                  )}
                  {message.role === 'assistant' && renderCitations(message.citations, message.content)}
                  {message.role === 'assistant' && message.runLog && message.runLog.length > 0 && (
                    <div className="mt-2 rounded-xl border border-border bg-muted/40 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Agent steps ({message.runLog.length})</span>
                        {renderRunStateBadge(message.runState)}
                      </div>
                      <details>
                        <summary className="cursor-pointer text-[11px] text-primary">View steps</summary>
                        <div className="mt-1 space-y-1">
                          {message.runLog.map((step) => (
                            <div key={step.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {step.status === 'completed' ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              ) : step.status === 'error' ? (
                                <XCircle className="h-3 w-3 text-red-500" />
                              ) : (
                                <Loader className="h-3 w-3 text-primary/60 animate-spin" />
                              )}
                              <span>{step.detail ? `${step.label}: ${step.detail}` : step.label}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming content - show as it arrives */}
            {streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl p-2.5 bg-card text-foreground border border-border shadow-sm">
                  <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-muted">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                  {renderCitations(streamingCitations, streamingContent)}
                </div>
              </div>
            )}

            {/* Activity indicators while generating */}
            {activities.length > 0 && isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-xl border border-border bg-card/80 p-2 text-muted-foreground">
                  <div className="mb-1 text-xs font-medium">
                    {activities.find(a => a.status === 'running')?.label || 'Working on your request...'}
                  </div>
                  <div className="mt-1 space-y-1">
                    {activities.map(activity => (
                      <div key={activity.id} className="flex items-center gap-2 text-[11px]">
                        {activity.status === 'completed' ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : activity.status === 'error' ? (
                          <XCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <Loader className="h-3 w-3 text-primary/60 animate-spin" />
                        )}
                        <span className="truncate">{activity.detail ? `${activity.label}: ${activity.detail}` : activity.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="max-w-[88%] rounded-xl p-2 bg-red-100 text-red-800 text-sm border border-red-200">{error}</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-3 bg-card border-t border-border">
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Ask about ${documentTitle || 'this document'}...`}
            disabled={isLoading || aiLocked || authLoading || sourceUnavailable}
            className="h-10 rounded-full border-border bg-muted/50 focus-visible:bg-card"
          />
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-10 rounded-full p-0 shadow-sm border-border bg-card hover:bg-muted"
              onClick={handleStopGenerating}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="h-10 w-10 rounded-full p-0 shadow-sm transition-all hover:shadow disabled:opacity-40"
              disabled={!input.trim() || aiLocked || authLoading || sourceUnavailable}
              aria-label="Send message"
              title="Send message"
            >
              <ArrowUp className="h-4.5 w-4.5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
