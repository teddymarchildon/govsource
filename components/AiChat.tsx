'use client';

import { useState, useRef, useEffect } from 'react';
import { XMarkIcon, DocumentTextIcon, SparklesIcon, ClockIcon, ScaleIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Define preset types that match the backend types
type PresetType = 'default' | 'summarize' | 'keyPoints' | 'historicalContext' | 'prosAndCons';

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
function getPresets(documentType: AiChatProps['documentType']): Preset[] {
  const noun = getDocumentNoun(documentType);
  return [
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
}

interface AiChatProps {
  documentType: 'bill' | 'law' | 'agencyDocument' | 'opinion' | 'executiveOrder';
  documentId: string;
  documentTitle: string;
  htmlFilePath?: string;
  pdfFilePath?: string;
}

export default function AiChat({
  documentType,
  documentId,
  documentTitle,
  htmlFilePath
}: AiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth state
  const { user, loading: authLoading, isPaidSubscriber } = useAuth();

  // Get tailored presets for the current documentType
  const PRESETS = getPresets(documentType);

  // Scroll to bottom of messages when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [subscribing, setSubscribing] = useState(false);

  // Function to handle sending a message to the AI API
  const sendMessageToApi = async (messagesToSend: Message[], presetType: PresetType = 'default') => {
    setIsLoading(true);
    setError(null);

    try {
      // We'll let the API handle content fetching
      const documentContent = null;

      // Call the API endpoint with the messages and document content
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messagesToSend,
          documentContent,
          documentType,
          documentId,
          documentTitle,
          htmlFilePath,
          presetType, // Send the preset type to the backend
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
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

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat bubble button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-3 rounded-lg bg-blue-700 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all text-sm font-medium"
          aria-label="AI Chat"
        >
          {buttonText}
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="flex flex-col w-96 md:w-[550px] h-[600px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="p-3 bg-blue-700 text-white flex justify-between items-center">
            <h2 className="text-lg font-semibold">GovSource Assistant</h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-white/80"
                aria-label="Close chat"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Info indicator if htmlFilePath is not defined */}
          {!htmlFilePath && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs border-b border-blue-100">
              <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
              <span>Document text is not available. The AI will also search the web to find additional information.</span>
            </div>
          )}
          {/* Info indicator if htmlFilePath is defined */}
          {htmlFilePath && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs border-b border-blue-100">
            <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <span>The AI will only use the contents of this document. No web searching or other sources are included.</span>
          </div>
        )}

          {/* Preset buttons (moved to top, with extra spacing) */}
          <div className="p-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-2 justify-center mt-3">
            {isPaidSubscriber ? (
              PRESETS.map((preset) => {
                let IconComponent = null;
                switch (preset.type) {
                  case 'summarize':
                    IconComponent = DocumentTextIcon;
                    break;
                  case 'keyPoints':
                    IconComponent = SparklesIcon;
                    break;
                  case 'historicalContext':
                    IconComponent = ClockIcon;
                    break;
                  case 'prosAndCons':
                    IconComponent = ScaleIcon;
                    break;
                  default:
                    IconComponent = DocumentTextIcon;
                }
                return (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset)}
                    disabled={isLoading}
                    className={`px-3 py-1.5 text-xs rounded-full transition-colors flex items-center gap-1.5 ${
                      isLoading
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    <IconComponent className="h-4 w-4" />
                    {preset.label}
                  </button>
                );
              })
            ) : (
              <div className="w-full text-center text-sm text-gray-500 py-2">
                You must be a paid subscriber to use the AI Assistant. <br />
                <button
                  className="text-blue-700 font-medium underline disabled:opacity-50"
                  style={{ cursor: user ? 'pointer' : 'not-allowed' }}
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
                  {subscribing ? 'Redirecting...' : 'Subscribe to unlock AI features.'}
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {/* If not logged in and not loading, show login message */}
            {!user && !authLoading ? (
              <div className="flex justify-center items-center h-full">
                <div className="max-w-[85%] rounded-lg p-4 bg-yellow-100 text-yellow-900 text-center text-sm border border-yellow-300">
                  <p>You must log in to use the AI Assistant.</p>
                </div>
              </div>
            ) : !isPaidSubscriber ? (
              <div className="flex justify-center items-center h-full">
                <div className="max-w-[85%] rounded-lg p-4 bg-blue-100 text-blue-900 text-center text-sm border border-blue-300">
                  <p>You must be a paid subscriber to use the AI Assistant.</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-2.5 ${
                        message.role === 'user'
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-white text-gray-900 border border-gray-200'
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-sm markdown-content prose">
                        <ReactMarkdown>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-lg p-2.5 bg-white border border-gray-200">
                      <div className="flex space-x-1.5 items-center">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex justify-center">
                    <div className="max-w-[85%] rounded-lg p-2.5 bg-red-100 text-red-800 text-sm">
                      <p>{error}</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-gray-200">
            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about ${documentTitle || 'this document'}...`}
                className="flex-1 p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading || (!user && !authLoading) || !isPaidSubscriber}
              />
              <button
                type="submit"
                className={`px-3 py-2 rounded-lg text-white text-sm ${
                  isLoading || !input.trim() || (!user && !authLoading) || !isPaidSubscriber
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                disabled={isLoading || !input.trim() || (!user && !authLoading) || !isPaidSubscriber}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
