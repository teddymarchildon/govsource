'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase/client';
import { usePathname } from 'next/navigation';
import { getLoginUrl } from '@/utils/utils';
import { MessageSquare } from 'lucide-react';

const MIN_FEEDBACK_LENGTH = 10;
const MAX_FEEDBACK_LENGTH = 500;

export default function FeedbackForm() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const pathname = usePathname();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmedFeedback = feedback.trim();
  const feedbackLength = feedback.length;
  const charactersLeft = MAX_FEEDBACK_LENGTH - feedbackLength;
  const canSubmit =
    Boolean(user) && !isSubmitting && trimmedFeedback.length >= MIN_FEEDBACK_LENGTH;

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const openForm = () => {
    setError(null);
    setIsOpen(true);
  };

  const closeForm = () => {
    setError(null);
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be logged in to submit feedback.');
      return;
    }
    if (trimmedFeedback.length < MIN_FEEDBACK_LENGTH) {
      setError(`Feedback must be at least ${MIN_FEEDBACK_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('user_feedback')
        .insert({ user_id: user.id, feedback: trimmedFeedback });

      if (insertError) {
        throw insertError;
      }

      setIsSubmitted(true);
      setFeedback('');
      closeTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
        setIsSubmitted(false);
      }, 2500);
    } catch (err: any) {
      setError('Failed to submit feedback. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {!isOpen && (
        <button
          onClick={openForm}
          className="bg-primary text-white rounded-full px-4 py-2 shadow-lg hover:bg-primary/90 transition-colors text-sm flex items-center gap-2"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="feedback-form-panel"
        >
          <MessageSquare className="h-5 w-5" />
          <span>Have feedback?</span>
        </button>
      )}

      {isOpen && (
        <div
          id="feedback-form-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="feedback-form-title"
          className="bg-white p-6 rounded-lg shadow-xl w-80"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 id="feedback-form-title" className="text-lg font-semibold">
              Help us improve GovSource
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="text-gray-500 hover:text-gray-800"
              aria-label="Close feedback form"
            >
              &times;
            </button>
          </div>

          {isSubmitted ? (
            <p className="text-green-600" role="status">
              Thank you for your feedback!
            </p>
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Sign in to share product feedback and feature requests.
              </p>
              <a
                href={getLoginUrl(pathname)}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                Log in to leave feedback
              </a>
              <p className="text-xs text-gray-500">You can close this panel and continue browsing.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-sm text-gray-600 mb-2">
                Tell us what is working, what is missing, or what you want next.
              </p>
              <textarea
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="Tell us what you think..."
                className="w-full p-2 border rounded-md"
                rows={4}
                maxLength={MAX_FEEDBACK_LENGTH}
                disabled={isSubmitting}
                autoFocus
              />
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Minimum {MIN_FEEDBACK_LENGTH} characters</span>
                <span>{charactersLeft} characters left</span>
              </div>
              {error && (
                <p className="text-sm text-red-500 mt-2" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/90 disabled:bg-gray-400"
                disabled={!canSubmit}
              >
                {isSubmitting ? 'Submitting...' : 'Send feedback'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
} 