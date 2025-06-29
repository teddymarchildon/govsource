'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  saveCongressman, unsaveCongressman, isCongressmanSaved, 
  saveBill, unsaveBill, isBillSaved, 
  saveAgency, unsaveAgency, isAgencySaved,
  saveJudge, unsaveJudge, isJudgeSaved,
  saveCluster, unsaveCluster, isClusterSaved,
  saveAgencyDocument, unsaveAgencyDocument, isAgencyDocumentSaved
} from '../services/api';
import { Button } from './ui/button';

interface SaveButtonProps {
  itemId: string;
  itemType: 'congressman' | 'bill' | 'agency' | 'judge' | 'cluster' | 'agencyDocument';
  className?: string;
}

export default function SaveButton({ itemId, itemType, className = '' }: SaveButtonProps) {
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkIfSaved = async () => {
      if (!user) {
        setIsSaved(false);
        return;
      }

      setIsLoading(true);
      try {
        let saved = false;
        
        switch (itemType) {
          case 'congressman':
            saved = await isCongressmanSaved(user.id, itemId);
            break;
          case 'bill':
            saved = await isBillSaved(user.id, itemId);
            break;
          case 'agency':
            saved = await isAgencySaved(user.id, itemId);
            break;
          case 'judge':
            saved = await isJudgeSaved(user.id, itemId);
            break;
          case 'cluster':
            saved = await isClusterSaved(user.id, itemId);
            break;
          case 'agencyDocument':
            saved = await isAgencyDocumentSaved(user.id, itemId);
            break;
        }
        
        setIsSaved(saved);
      } catch (error) {
        console.error(`Error checking if ${itemType} is saved:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    checkIfSaved();
  }, [itemId, itemType, user]);

  const handleToggleSave = async () => {
    if (!user) {
      // TODO: Redirect to login or show login modal
      alert('Please sign in to save items');
      return;
    }

    setIsLoading(true);
    try {
      switch (itemType) {
        case 'congressman':
          if (isSaved) {
            await unsaveCongressman(user.id, itemId);
          } else {
            await saveCongressman(user.id, itemId);
          }
          break;
        case 'bill':
          if (isSaved) {
            await unsaveBill(user.id, itemId);
          } else {
            await saveBill(user.id, itemId);
          }
          break;
        case 'agency':
          if (isSaved) {
            await unsaveAgency(user.id, itemId);
          } else {
            await saveAgency(user.id, itemId);
          }
          break;
        case 'judge':
          if (isSaved) {
            await unsaveJudge(user.id, itemId);
          } else {
            await saveJudge(user.id, itemId);
          }
          break;
        case 'cluster':
          if (isSaved) {
            await unsaveCluster(user.id, itemId);
          } else {
            await saveCluster(user.id, itemId);
          }
          break;
        case 'agencyDocument':
          if (isSaved) {
            await unsaveAgencyDocument(user.id, itemId);
          } else {
            await saveAgencyDocument(user.id, itemId);
          }
          break;
      }
      
      setIsSaved(!isSaved);
    } catch (error) {
      console.error(`Error toggling save for ${itemType}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleToggleSave}
      disabled={isLoading}
      variant="outline"
      size="sm"
      className={`inline-flex items-center ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`h-4 w-4 mr-1 ${isSaved ? 'text-yellow-500 fill-yellow-500' : 'text-gray-500'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
      {isSaved ? 'Watching' : 'Watch'}
    </Button>
  );
}
