'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase/client';
import { usePathname } from 'next/navigation';
import { getLoginUrl } from '@/utils/utils';

export default function FeedbackForm() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const pathname = usePathname();

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    // Reset form state when closing
    if (isOpen) {
      setFeedback('');
      setError(null);
      setIsSubmitted(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be logged in to submit feedback.');
      return;
    }
    if (!feedback.trim()) {
      setError('Feedback cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('user_feedback')
        .insert({ user_id: user.id, feedback });

      if (insertError) {
        throw insertError;
      }

      setIsSubmitted(true);
      setFeedback('');
      setTimeout(() => {
        setIsOpen(false);
        setIsSubmitted(false);
      }, 2000); // Close form after 2 seconds
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
          onClick={toggleOpen}
          className="bg-primary text-white rounded-full px-4 py-2 shadow-lg hover:bg-primary/90 transition-colors"
        >
          Have feedback?
        </button>
      )}

      {isOpen && (
        <div className="bg-white p-6 rounded-lg shadow-xl w-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">What do you want to see in GovSource?</h3>
            <button onClick={toggleOpen} className="text-gray-500 hover:text-gray-800">
              &times;
            </button>
          </div>

          {isSubmitted ? (
            <p className="text-green-600">Thank you for your feedback!</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell us what you think..."
                className={`w-full p-2 border rounded-md ${!user ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                rows={4}
                disabled={!user || isSubmitting}
              />
              {!user && (
                <p className="text-sm text-red-500 mt-2">
                  Please <a href={getLoginUrl(pathname)} className="underline">log in</a> to submit feedback.
                </p>
              )}
              {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
              <button
                type="submit"
                className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-primary/90 disabled:bg-gray-400"
                disabled={!user || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
} 