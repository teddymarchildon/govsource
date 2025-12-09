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

interface Activity {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'error';
  detail?: string;
}

type PresetType = 'default' | 'summarizeKeyPoints' | 'historicalContext' | 'prosAndCons' | 'diff';

interface Preset {
  type: PresetType;
  label: string;
  icon: typeof FileText;
  getMessage: (noun: string) => string;
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
}

export default function AiChat({
  documentType,
  documentId,
  documentTitle,
  htmlFilePath,
  diffHtmlFilePaths,
  height = '600px'
}: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
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

  const updateActivity = (activity: Activity) => {
    setActivities(prev => {
      const idx = prev.findIndex(a => a.id === activity.id);
      if (idx === -1) return [...prev, activity];
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...activity };
      return updated;
    });
  };

  const sendMessage = async (messagesToSend: Message[], presetType: PresetType = 'default') => {
    setIsLoading(true);
    setError(null);
    setStreamingContent('');
    setActivities([{ id: 'thinking', label: 'Thinking', status: 'running', detail: 'preparing...' }]);

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
        userId: user?.id,
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
      let accumulatedContent = '';

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
                updateActivity({ id: payload.id, label: payload.label, status: payload.status, detail: payload.detail });
              } else if (payload.type === 'text_delta') {
                accumulatedContent += payload.delta;
                setStreamingContent(accumulatedContent);
              } else if (payload.type === 'stream_end') {
                if (accumulatedContent.trim()) {
                  setMessages(prev => [...prev, { role: 'assistant', content: accumulatedContent }]);
                  if (!user) setAnonUsage(u => u + 1);
                }
                setStreamingContent('');
                setActivities([]);
              } else if (payload.type === 'error') {
                setError(payload.message);
              }
            } catch {}
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('AI API error:', err);
      setError('Failed to get a response. Please try again.');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
        setStreamingContent('');
        setActivities([]);
      }
    }
  };

  const handlePresetClick = (preset: Preset) => {
    if (isLoading || aiLocked) return;
    const userMessage: Message = { role: 'user', content: preset.getMessage(noun) };
    setMessages(prev => [...prev, userMessage]);
    sendMessage([userMessage], preset.type);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || aiLocked) return;
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    sendMessage([...messages, userMessage]);
  };

  const [subscribing, setSubscribing] = useState(false);

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
      className={`w-full flex flex-col bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden ${!height ? 'flex-1' : ''}`}
      style={height ? { height } : {}}
    >
      {/* Header */}
      <div className="p-2 bg-primary text-white flex justify-between items-center rounded-t-xl">
        <h2 className="text-base font-semibold">GovSource Assistant</h2>
        {!isPaidSubscriber && user && (
          <span className="ml-2 text-xs text-gray-200 bg-primary/30 px-2 py-0.5 rounded">
            {aiInteractions}/{AI_FREE_USAGE_LIMIT} free uses
          </span>
        )}
        {!user && !authLoading && (
          <span className="ml-2 text-xs text-gray-200 bg-primary/30 px-2 py-0.5 rounded">
            {anonUsage}/{ANON_LIMIT} uses before sign up
          </span>
        )}
      </div>

      {/* Document info banner */}
      <div className="flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground text-xs border-b border-primary/20">
        <span>
          {htmlFilePath
            ? 'The assistant will objectively analyze the text and information here. No other sources are considered.'
            : 'The assistant cannot process this document. It will search the web to find additional information.'}
        </span>
      </div>

      {/* Preset buttons */}
      <div className="p-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-1.5 justify-center">
        {presets.map(preset => (
          <Button
            key={preset.type}
            onClick={() => handlePresetClick(preset)}
            disabled={isLoading || aiLocked}
            variant="outline"
            className={`px-2 py-1 text-xs flex items-center gap-1 ${aiLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{ borderRadius: '0.5rem' }}
          >
            <preset.icon className="h-3.5 w-3.5" />
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 bg-gray-50" ref={scrollContainerRef}>
        {!user && !authLoading && anonLimitReached ? (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-600 mb-2">Sign in to continue using the AI Assistant</p>
            <a
              href={getLoginUrl(pathname)}
              className="inline-block px-3 py-1.5 bg-primary text-white font-medium hover:bg-primary/90 transition text-sm rounded-md"
            >
              Sign in
            </a>
          </div>
        ) : aiLocked ? (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-600 mb-2">You have reached your free AI usage limit.</p>
            <Button
              className="text-sm rounded-lg"
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
                  className={`max-w-[85%] rounded-lg p-2 ${
                    message.role === 'user'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  <div className="prose prose-sm prose-gray max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-gray-100">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming content - show as it arrives */}
            {streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg p-2 bg-white text-gray-900 border border-gray-200">
                  <div className="prose prose-sm prose-gray max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-gray-100">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* Activity indicators - only show when not streaming text */}
            {activities.length > 0 && isLoading && !streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] text-sm text-primary/80 space-y-1">
                  {activities.map(activity => (
                    <div key={activity.id} className="flex items-center gap-2 text-xs">
                      {activity.status === 'completed' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : activity.status === 'error' ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      ) : (
                        <Loader className="h-3.5 w-3.5 text-primary/60 animate-spin" />
                      )}
                      <span className="truncate">{activity.detail ? `${activity.label} - ${activity.detail}` : activity.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="max-w-[85%] rounded-lg p-2 bg-red-100 text-red-800 text-sm">{error}</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-2 bg-white border-t border-gray-200">
        <div className="flex space-x-2">
          <Input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Ask about ${documentTitle || 'this document'}...`}
            disabled={isLoading || aiLocked || authLoading}
            className="h-9 rounded-lg"
          />
          <Button
            type="submit"
            className="px-3 py-1.5 text-white text-sm h-9 rounded-lg"
            disabled={isLoading || !input.trim() || aiLocked || authLoading}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
