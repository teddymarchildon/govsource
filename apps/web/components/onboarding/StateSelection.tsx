'use client';

import { useState } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { US_STATES } from '../../constants/onboarding';

export default function StateSelection() {
  const { userPreferences, updatePreference, savePreferences, goToNextStep, skipOnboarding } = useOnboarding();
  const [selectedStates, setSelectedStates] = useState<string[]>(userPreferences.states || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleStateToggle = async (stateCode: string) => {
    // Update local state first
    const newSelectedStates = selectedStates.includes(stateCode)
      ? selectedStates.filter(s => s !== stateCode)
      : [...selectedStates, stateCode];

    setSelectedStates(newSelectedStates);

    // Then update context and save to database
    setIsSaving(true);
    try {
      updatePreference('states', newSelectedStates);
      await savePreferences();
    } catch (error) {
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = async () => {
    // We don't need to save preferences again since they're already saved
    // Just go to the next step
    goToNextStep();
  };

  const handleSkip = async () => {
    // Skip the onboarding flow but mark that the user has seen it
    await skipOnboarding();
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Which states are you interested in?</h2>
      <p className="text-gray-600 mb-8">
        Select the states you want to follow. This helps us show you relevant content.
        You can always change these later.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
        {US_STATES.map((state) => (
          <button
            key={state.code}
            onClick={() => handleStateToggle(state.code)}
            disabled={isSaving}
            className={`p-3 rounded-lg border transition-colors text-left ${
              selectedStates.includes(state.code)
                ? 'bg-secondary border-primary text-primary'
                : 'bg-white border-border hover:bg-gray-50'
            } ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <div className="text-sm font-medium">{state.code}</div>
            <div className="text-xs">{state.name}</div>
          </button>
        ))}
      </div>

      <div className="flex justify-end mt-8">
        <button
          onClick={handleContinue}
          disabled={isSaving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
      <div className="text-center mt-4">
        <button
          onClick={handleSkip}
          disabled={isSaving}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
