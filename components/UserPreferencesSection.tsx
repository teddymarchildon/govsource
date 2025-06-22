'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserPreferences, updateUserPreferences } from '../services/api';
import { US_STATES } from '../constants/states';
import { POLICY_AREAS } from '../constants/policyAreas';
import { UserPreferences } from '../types/types';
import type { PolicyArea } from '../types/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import LoadingSpinner from './LoadingSpinner';
import { XIcon } from 'lucide-react';

const UserPreferencesSection = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedPolicyAreas, setSelectedPolicyAreas] = useState<PolicyArea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stateSearchTerm, setStateSearchTerm] = useState('');
  const [policyAreaSearchTerm, setPolicyAreaSearchTerm] = useState('');
  const [isStatePopoverOpen, setIsStatePopoverOpen] = useState(false);
  const [isPolicyPopoverOpen, setIsPolicyPopoverOpen] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      if (!user) return;

      try {
        setIsLoading(true);
        const prefs = await getUserPreferences(user.id);
        setPreferences(prefs);

        if (prefs) {
          setSelectedStates(prefs.states || []);
          setSelectedPolicyAreas(prefs.policy_areas || []);
        }
      } catch (error) {
        console.error('Error fetching preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, [user]);
  
  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    if (!user) return;
    try {
      await updateUserPreferences(user.id, {
        states: selectedStates,
        policy_areas: selectedPolicyAreas,
        ...prefs,
      });
    } catch (error) {
      console.error('Error updating preferences:', error);
      // Optionally, revert state or show error message
    }
  };


  const addState = (state: string) => {
    if (!selectedStates.includes(state)) {
      const newSelectedStates = [...selectedStates, state];
      setSelectedStates(newSelectedStates);
      updatePreferences({ states: newSelectedStates });
    }
    setStateSearchTerm('');
    setIsStatePopoverOpen(false);
  };

  const removeState = (state: string) => {
    const newSelectedStates = selectedStates.filter(s => s !== state);
    setSelectedStates(newSelectedStates);
    updatePreferences({ states: newSelectedStates });
  };

  const addPolicyArea = (area: PolicyArea) => {
    if (!selectedPolicyAreas.includes(area)) {
      const newSelectedPolicyAreas = [...selectedPolicyAreas, area];
      setSelectedPolicyAreas(newSelectedPolicyAreas);
      updatePreferences({ policy_areas: newSelectedPolicyAreas });
    }
    setPolicyAreaSearchTerm('');
    setIsPolicyPopoverOpen(false);
  };

  const removePolicyArea = (area: PolicyArea) => {
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

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Your Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-32">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Your Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* States to watch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              States to watch
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedStates.map(state => (
                <Badge key={state} variant="secondary" className="pl-3 pr-1 py-1 text-sm">
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
                <div className="text-sm text-gray-500 italic">No states selected</div>
              )}
            </div>
            <Popover open={isStatePopoverOpen} onOpenChange={setIsStatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-gray-500">
                  Search and select states...
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <div className="p-2">
                    <Input
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
                            onClick={() => addState(state)}
                            >
                            {state}
                            </Button>
                        ))
                    ) : (
                        <div className="p-4 text-sm text-center text-gray-500">
                        No states found.
                        </div>
                    )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Policy areas to watch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Policy areas to watch
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedPolicyAreas.map(area => (
                 <Badge key={area} variant="secondary" className="pl-3 pr-1 py-1 text-sm">
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
                <div className="text-sm text-gray-500 italic">No policy areas selected</div>
              )}
            </div>
            <Popover open={isPolicyPopoverOpen} onOpenChange={setIsPolicyPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-gray-500">
                        Search and select policy areas...
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                <div className="p-2">
                    <Input
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
                            onClick={() => addPolicyArea(area as PolicyArea)}
                            >
                            {area}
                            </Button>
                        ))
                    ) : (
                        <div className="p-4 text-sm text-center text-gray-500">
                            No policy areas found.
                        </div>
                    )}
                </div>
                </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserPreferencesSection;
