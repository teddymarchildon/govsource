'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { createClient } from '../utils/supabase/client';
import { UserPreferences } from '../types/types';

// Extended UserPreferences for the onboarding flow
interface OnboardingUserPreferences extends UserPreferences {
  onboarding_completed: boolean;
}

type OnboardingContextType = {
  currentStep: number;
  totalSteps: number;
  isLoading: boolean;
  userPreferences: OnboardingUserPreferences;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  updatePreference: (key: keyof OnboardingUserPreferences, value: any) => void;
  savePreferences: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  skipOnboarding: () => Promise<void>;
};

const defaultUserPreferences: OnboardingUserPreferences = {
  id: '',
  user_id: '',
  states: [],
  policy_areas: [],
  onboarding_completed: false
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [userPreferences, setUserPreferences] = useState<OnboardingUserPreferences>(defaultUserPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const totalSteps = 2; // Total number of onboarding steps (states and policy areas)

  // Check if user has already completed onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // First check user_usage table to see if user has seen onboarding
        const { data: usageData, error: usageError } = await supabase
          .from('user_usage')
          .select('saw_onboarding_flow_at')
          .eq('user_id', user.id)
          .single();

        if (usageError && usageError.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
          console.error('Error fetching user usage:', usageError);
        }

        // If user has seen onboarding, redirect to home
        if (usageData && usageData.saw_onboarding_flow_at) {
          setUserPreferences(prev => ({
            ...prev,
            onboarding_completed: true
          }));

          if (window.location.pathname.includes('/onboarding')) {
            router.push('/');
          }
          setIsLoading(false);
          return;
        }

        // If user hasn't seen onboarding, check if they have preferences
        const { data: prefsData, error: prefsError } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (prefsError && prefsError.code !== 'PGRST116') {
          console.error('Error fetching user preferences:', prefsError);
        }

        if (prefsData) {
          setUserPreferences({
            id: prefsData.id || '',
            user_id: prefsData.user_id || user.id,
            states: prefsData.states || [],
            policy_areas: prefsData.policy_areas || [],
            onboarding_completed: false // Still show onboarding if saw_onboarding_flow_at is null
          });
        } else if (user) {
          // If no preferences exist yet, set user_id
          setUserPreferences(prev => ({
            ...prev,
            user_id: user.id
          }));
        }
      } catch (error) {
        console.error('Error in onboarding check:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboardingStatus();
  }, [user, router]);

  const goToNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updatePreference = (key: keyof OnboardingUserPreferences, value: any) => {
    setUserPreferences(prev => {
      const newPreferences = {
        ...prev,
        [key]: value
      };
      return newPreferences;
    });
  };

  const savePreferences = async () => {
    if (!user) return;

    try {
      // Get the latest state directly to avoid stale closure values
      const currentPreferences = { ...userPreferences };

      // Create deep copies of the arrays to avoid reference issues
      const states = Array.isArray(currentPreferences.states)
        ? [...currentPreferences.states]
        : [];

      const policy_areas = Array.isArray(currentPreferences.policy_areas)
        ? [...currentPreferences.policy_areas]
        : [];

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          states,
          policy_areas
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      throw error;
    }
  };

  const markOnboardingAsSeen = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_usage')
        .upsert({
          user_id: user.id,
          saw_onboarding_flow_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
    } catch (error) {
      throw error;
    }
  };

  const completeOnboarding = async () => {
    setIsLoading(true);
    try {
      // Mark onboarding as seen
      await markOnboardingAsSeen();

      // Update local state
      updatePreference('onboarding_completed', true);

      router.push('/');
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const skipOnboarding = async () => {
    setIsLoading(true);
    try {
      // Mark onboarding as seen
      await markOnboardingAsSeen();

      // Update local state
      updatePreference('onboarding_completed', true);

      // Navigate to dashboard
      router.push('/');
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        totalSteps,
        isLoading,
        userPreferences,
        goToNextStep,
        goToPreviousStep,
        updatePreference,
        savePreferences,
        completeOnboarding,
        skipOnboarding
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
