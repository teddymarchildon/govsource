'use client';

import { useState } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { POLICY_AREAS } from '../../constants/onboarding';
import type { PolicyArea } from '../../types/types';

export default function PolicyAreaSelection() {
  const { userPreferences, updatePreference, savePreferences, goToPreviousStep, completeOnboarding } = useOnboarding();
  const [selectedAreas, setSelectedAreas] = useState<PolicyArea[]>(userPreferences.policy_areas as PolicyArea[] || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleAreaToggle = async (area: string) => {
    // Update local state first
    const newSelectedAreas = selectedAreas.includes(area as PolicyArea)
      ? selectedAreas.filter(a => a !== area)
      : [...selectedAreas, area];

    setSelectedAreas(newSelectedAreas as PolicyArea[]);

    // Then update context and save to database
    setIsSaving(true);
    try {
      updatePreference('policy_areas', newSelectedAreas);
      await savePreferences();
    } catch (error) {
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      await savePreferences();
      await completeOnboarding();
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Which policy areas interest you?</h2>
      <p className="text-gray-600 mb-8">
        Select the policy areas you want to follow. This helps us show you relevant content.
        You can always change these later.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {POLICY_AREAS.map((area) => (
          <button
            key={area}
            onClick={() => handleAreaToggle(area)}
            disabled={isSaving}
            className={`p-3 rounded-lg border transition-colors text-left ${
              selectedAreas.includes(area)
                ? 'bg-secondary border-primary text-primary'
                : 'bg-white border-border hover:bg-gray-50'
            } ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {area}
          </button>
        ))}
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={goToPreviousStep}
          className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          disabled={isSaving}
        >
          Back
        </button>
        <button
          onClick={handleComplete}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Complete'}
        </button>
      </div>
      <div className="text-center mt-4">
        <button
          onClick={handleComplete}
          className="text-gray-500 hover:text-gray-700 text-sm"
          disabled={isSaving}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
