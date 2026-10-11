'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeAuthRedirect } from '@/utils/authRedirect';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabase/client';
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
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const destination = safeAuthRedirect(searchParams.get('redirect'));
  const router = useRouter();
  const totalSteps = 2; // Total number of onboarding steps (states and policy areas)

  useEffect(() => {
    let cancelled = false;
    const checkOnboardingStatus = async () => {
      if (!userId) {
        setUserPreferences(defaultUserPreferences);
        setLoadedUserId(null);
        setCurrentStep(1);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setCurrentStep(1);
      try {
        const [usage, prefs] = await Promise.all([
          supabase.from('user_usage').select('saw_onboarding_flow_at').eq('user_id', userId).maybeSingle(),
          supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
        ]);
        if (usage.error) throw usage.error;
        if (prefs.error) throw prefs.error;
        if (cancelled) return;
        setUserPreferences({
          id: prefs.data?.id || '',
          user_id: userId,
          states: prefs.data?.states || [],
          policy_areas: prefs.data?.policy_areas || [],
          onboarding_completed: !!usage.data?.saw_onboarding_flow_at,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Error checking onboarding:', error);
        setUserPreferences({ ...defaultUserPreferences, user_id: userId });
      } finally {
        if (!cancelled) {
          setLoadedUserId(userId);
          setIsLoading(false);
        }
      }
    };
    void checkOnboardingStatus();
    return () => { cancelled = true; };
  }, [userId]);

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

      router.replace(destination);
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
      router.replace(destination);
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
        isLoading: authLoading || isLoading || (!!userId && loadedUserId !== userId),
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
