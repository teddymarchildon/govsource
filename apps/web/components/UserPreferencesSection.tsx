'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserPreferences, updateUserPreferences } from '../services/api';
import { US_STATES } from '../constants/states';
import { POLICY_AREAS } from '../constants/policyAreas';
import { UserPreferences } from '../types/types';
import type { PolicyArea } from '../types/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { XIcon } from 'lucide-react';
import LoadingIndicator from './ui/LoadingIndicator';

const UserPreferencesSection = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedPolicyAreas, setSelectedPolicyAreas] = useState<PolicyArea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const savingRef = useRef(false);
  const [stateSearchTerm, setStateSearchTerm] = useState('');
  const [policyAreaSearchTerm, setPolicyAreaSearchTerm] = useState('');
  const [isStatePopoverOpen, setIsStatePopoverOpen] = useState(false);
  const [isPolicyPopoverOpen, setIsPolicyPopoverOpen] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      if (!user) return;

      try {
        setIsLoading(true);
        setLoadError(false);
        const prefs = await getUserPreferences(user.id, true);
        setPreferences(prefs);

        if (prefs) {
          setSelectedStates(prefs.states || []);
          setSelectedPolicyAreas(prefs.policy_areas || []);
        }
      } catch (error) {
        console.error('Error fetching preferences:', error);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, [user, retry]);
  
  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    if (!user || savingRef.current) return;
    savingRef.current = true;
    setSaveStatus('saving');
    const next = { states: selectedStates, policy_areas: selectedPolicyAreas, ...prefs };
    try {
      await updateUserPreferences(user.id, next);
      setPreferences(previous => ({ ...previous, ...next }) as UserPreferences);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Error updating preferences:', error);
      setSelectedStates(preferences?.states || []);
      setSelectedPolicyAreas((preferences?.policy_areas || []).filter((area): area is PolicyArea => POLICY_AREAS.includes(area as PolicyArea)));
      setSaveStatus('error');
    } finally {
      savingRef.current = false;
    }
  };


  const addState = (state: string) => {
    if (savingRef.current) return;
    if (!selectedStates.includes(state)) {
      const newSelectedStates = [...selectedStates, state];
      setSelectedStates(newSelectedStates);
      updatePreferences({ states: newSelectedStates });
    }
    setStateSearchTerm('');
    setIsStatePopoverOpen(false);
  };

  const removeState = (state: string) => {
    if (savingRef.current) return;
    const newSelectedStates = selectedStates.filter(s => s !== state);
    setSelectedStates(newSelectedStates);
    updatePreferences({ states: newSelectedStates });
  };

  const addPolicyArea = (area: PolicyArea) => {
    if (savingRef.current) return;
    if (!selectedPolicyAreas.includes(area)) {
      const newSelectedPolicyAreas = [...selectedPolicyAreas, area];
      setSelectedPolicyAreas(newSelectedPolicyAreas);
      updatePreferences({ policy_areas: newSelectedPolicyAreas });
    }
    setPolicyAreaSearchTerm('');
    setIsPolicyPopoverOpen(false);
  };

  const removePolicyArea = (area: PolicyArea) => {
    if (savingRef.current) return;
    const newSelectedPolicyAreas = selectedPolicyAreas.filter(a => a !== area);
    setSelectedPolicyAreas(newSelectedPolicyAreas);
    updatePreferences({ policy_areas: newSelectedPolicyAreas });
  };

  const filteredStates = US_STATES.filter(state =>
    state.toLowerCase().includes(stateSearchTerm.toLowerCase()) &&
    !selectedStates.includes(state)
  );

  const filteredPolicyAreas = POLICY_AREAS.filter(area =>
    area.toLowerCase().includes(policyAreaSearchTerm.toLowerCase()) &&
    !selectedPolicyAreas.includes(area)
  );

  if (isLoading) return <div className="flex justify-center py-16"><LoadingIndicator size="large" /></div>;
  if (loadError) return <div role="alert" className="border-y border-border py-8"><p className="text-sm text-muted-foreground">We couldn’t load your preferences. Please try again.</p><Button variant="outline" className="mt-4" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>;

  return (
    <section className="max-w-3xl" aria-labelledby="preferences-heading">
      <div className="border-b border-border pb-5">
        <h2 id="preferences-heading" className="font-serif text-2xl">Preferences</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose states and policy areas to personalize your GovSource feed.</p>
      </div>
      <p role="status" aria-live="polite" className={`min-h-12 py-3 text-xs ${saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'We couldn’t save that change. Your previous preferences were restored. Please try again.' : 'Changes save automatically.'}
      </p>
      <fieldset disabled={saveStatus === 'saving'} className="min-w-0 disabled:opacity-60">
        <legend className="sr-only">Personalize your feed</legend>
        <div className="space-y-6">
          {/* States */}
          <div>
            <h3 className="block text-sm font-semibold text-foreground mb-3">
              States
            </h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedStates.map(state => (
                <Badge key={state} variant="secondary" className="rounded-md pl-3 pr-1 py-1 text-sm font-normal">
                  {state}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-1 h-5 w-5 rounded-full"
                    onClick={() => removeState(state)}
                  >
                    <XIcon className="h-3 w-3" />
                    <span className="sr-only">Remove {state}</span>
                  </Button>
                </Badge>
              ))}
              {selectedStates.length === 0 && (
                <div className="text-sm text-muted-foreground">No states selected</div>
              )}
            </div>
            <Popover open={isStatePopoverOpen} onOpenChange={setIsStatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-muted-foreground">
                  Search and select states...
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <div className="p-2">
                    <Input
                    aria-label="Search states"
                    placeholder="Search states..."
                    value={stateSearchTerm}
                    onChange={(e) => setStateSearchTerm(e.target.value)}
                    className="w-full"
                    />
                </div>
                <div className="max-h-60 overflow-y-auto">
                    {filteredStates.length > 0 ? (
                        filteredStates.map(state => (
                            <Button
                            key={state}
                            variant="ghost"
                            className="w-full justify-start"
                            disabled={saveStatus === 'saving'}
                            onClick={() => addState(state)}
                            >
                            {state}
                            </Button>
                        ))
                    ) : (
                        <div className="p-4 text-sm text-center text-muted-foreground">
                        No states found.
                        </div>
                    )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Policy areas */}
          <div>
            <h3 className="block text-sm font-semibold text-foreground mb-3">
              Policy areas
            </h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedPolicyAreas.map(area => (
                 <Badge key={area} variant="outline" className="rounded-md border-border bg-secondary pl-3 pr-1 py-1 text-sm font-normal">
                  {area}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-1 h-5 w-5 rounded-full"
                    onClick={() => removePolicyArea(area)}
                  >
                    <XIcon className="h-3 w-3" />
                    <span className="sr-only">Remove {area}</span>
                  </Button>
                </Badge>
              ))}
              {selectedPolicyAreas.length === 0 && (
                <div className="text-sm text-muted-foreground">No policy areas selected</div>
              )}
            </div>
            <Popover open={isPolicyPopoverOpen} onOpenChange={setIsPolicyPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-muted-foreground">
                        Search and select policy areas...
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <div className="p-2">
                    <Input
                        aria-label="Search policy areas"
                        placeholder="Search policy areas..."
                        value={policyAreaSearchTerm}
                        onChange={(e) => setPolicyAreaSearchTerm(e.target.value)}
                        className="w-full"
                    />
                </div>
                <div className="max-h-60 overflow-y-auto">
                    {filteredPolicyAreas.length > 0 ? (
                        filteredPolicyAreas.map(area => (
                            <Button
                            key={area}
                            variant="ghost"
                            className="w-full justify-start"
                            disabled={saveStatus === 'saving'}
                            onClick={() => addPolicyArea(area as PolicyArea)}
                            >
                            {area}
                            </Button>
                        ))
                    ) : (
                        <div className="p-4 text-sm text-center text-muted-foreground">
                            No policy areas found.
                        </div>
                    )}
                </div>
                </PopoverContent>
            </Popover>
          </div>
        </div>
      </fieldset>
    </section>
  );
};

export default UserPreferencesSection;
