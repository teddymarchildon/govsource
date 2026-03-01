import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface QuickAction {
  title: string;
  prompt: string;
}

interface CongressmanChatProps {
  title: string;
  subtitle: string;
  className?: string;
  congressman: any;
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: "Legislative Style",
    prompt: "What is this Congress member's legislative style and approach to lawmaking? Consider their success rate, policy focus, and collaboration patterns."
  },
  {
    title: "Key Achievements",
    prompt: "What are this Congress member's most significant legislative achievements? Focus on bills they sponsored that became law and their impact."
  },
  {
    title: "Policy Focus",
    prompt: "What are this Congress member's main policy focus areas? Analyze their sponsored and cosponsored bills to identify patterns."
  },
  {
    title: "Bipartisan Work",
    prompt: "How does this Congress member work across party lines? Consider their cross-party collaboration patterns and success rates."
  },
  {
    title: "Committee Impact",
    prompt: "What committees has this Congress member served on, and how has that influenced their legislative work?"
  },
  {
    title: "Constituency Focus",
    prompt: "How does this Congress member's legislative work reflect their constituency's interests? Consider their district/state focus."
  }
];

const CongressmanChat: React.FC<CongressmanChatProps> = ({
  title,
  subtitle,
  className,
  congressman,
  messages,
  setMessages,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleQuickAction = async (prompt: string) => {
    if (isLoading) return;

    // Add user message
    const userMessage: Message = { role: 'user', content: prompt };

    // Add an empty assistant message that will be streamed
    const streamingMessage: Message = {
      role: 'assistant',
      content: '',
      isStreaming: true
    };

    setMessages([...messages, userMessage, streamingMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/congressman-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: prompt,
          congressman,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                streamedContent += parsed.content;
                setMessages((prev: Message[]) =>
                  prev.map((msg: Message, i: number) =>
                    i === prev.length - 1 ? { ...msg, content: streamedContent } : msg
                  )
                );
              }
            } catch (e) {
              console.error('Error parsing chunk:', e);
            }
          }
        }
      }

      // Update the final message to remove streaming state
      setMessages((prev: Message[]) =>
        prev.map((msg: Message, i: number) =>
          i === prev.length - 1 ? { ...msg, isStreaming: false } : msg
        )
      );
    } catch (error) {
      console.error('Error getting AI response:', error);
      // Add error message
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1), // Remove the streaming message
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error while processing your question. Please try again.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = { role: 'user', content: input };

    // Add an empty assistant message that will be streamed
    const streamingMessage: Message = {
      role: 'assistant',
      content: '',
      isStreaming: true
    };

    setMessages([...messages, userMessage, streamingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/congressman-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: input,
          congressman,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                streamedContent += parsed.content;
                setMessages((prev: Message[]) =>
                  prev.map((msg: Message, i: number) =>
                    i === prev.length - 1 ? { ...msg, content: streamedContent } : msg
                  )
                );
              }
            } catch (e) {
              console.error('Error parsing chunk:', e);
            }
          }
        }
      }

      // Update the final message to remove streaming state
      setMessages((prev: Message[]) =>
        prev.map((msg: Message, i: number) =>
          i === prev.length - 1 ? { ...msg, isStreaming: false } : msg
        )
      );
    } catch (error) {
      console.error('Error getting AI response:', error);
      // Add error message
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1), // Remove the streaming message
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error while processing your question. Please try again.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="bg-gray-100 p-4 rounded-t-lg flex-shrink-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg max-w-[80%] ${
                message.role === 'user'
                  ? 'bg-blue-100 ml-auto'
                  : 'bg-gray-100'
              }`}
            >
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
                )}
              </div>
            </div>
          ))}
          {isLoading && !messages[messages.length - 1]?.isStreaming && (
            <div className="bg-gray-100 p-3 rounded-lg max-w-[80%] animate-pulse">
              <p>Thinking...</p>
            </div>
          )}
          {messages.length === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
              {QUICK_ACTIONS.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={isLoading}
                  className="p-3 text-left bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 disabled:opacity-50"
                >
                  <h4 className="font-medium text-gray-900">{action.title}</h4>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{action.prompt}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t p-4 bg-white rounded-b-lg flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this Congress member..."
            className="flex-1 border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm bg-gray-50 hover:bg-white focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

export default CongressmanChat;
