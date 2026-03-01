'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSavedBills, getSavedCongressmen, getSavedAgencies,
  getSavedJudges, getSavedClusters, getSavedAgencyDocuments,
  unsaveBill, unsaveCongressman, unsaveAgency,
  unsaveJudge, unsaveCluster, unsaveAgencyDocument, createCheckoutSession
} from '../../services/api';
import BillCard from '../../components/BillCard';
import CongressmanCard from '../../components/CongressmanCard';
import AgencyCard from '../../components/AgencyCard';
import JudgeCard from '../../components/JudgeCard';
import CourtCaseCard from '../../components/CourtCaseCard';
import AgencyRuleCard from '../../components/AgencyRuleCard';
import {
  SavedBill, SavedCongressman, SavedAgency,
  SavedJudge, SavedCluster, SavedAgencyDocument,
} from '../../types/types';
import Link from 'next/link';
import UserPreferencesSection from '../../components/UserPreferencesSection';
import { usePathname } from 'next/navigation';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { Button } from '../../components/ui/button';
import { BookmarkMinus } from 'lucide-react';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { getLoginUrl } from '@/utils/utils';
import { AI_FREE_USAGE_LIMIT } from '@/constants/onboarding';

export default function ProfilePage() {
  const { user, loading, isPaidSubscriber, subscription, aiInteractions } = useAuth();
  const [savedBills, setSavedBills] = useState<SavedBill[]>([]);
  const [savedCongressmen, setSavedCongressmen] = useState<SavedCongressman[]>([]);
  const [savedAgencies, setSavedAgencies] = useState<SavedAgency[]>([]);
  const [savedJudges, setSavedJudges] = useState<SavedJudge[]>([]);
  const [savedClusters, setSavedClusters] = useState<SavedCluster[]>([]);
  const [savedAgencyDocuments, setSavedAgencyDocuments] = useState<SavedAgencyDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const fetchSavedItems = async () => {
      if (user) {
        try {
          const [bills, congressmen, agencies, judges, clusters, documents] = await Promise.all([
            getSavedBills(user.id),
            getSavedCongressmen(user.id),
            getSavedAgencies(user.id),
            getSavedJudges(user.id),
            getSavedClusters(user.id),
            getSavedAgencyDocuments(user.id)
          ]);

          setSavedBills(bills);
          setSavedCongressmen(congressmen);
          setSavedAgencies(agencies);
          setSavedJudges(judges);
          setSavedClusters(clusters);
          setSavedAgencyDocuments(documents);
        } catch (error) {
          console.error('Error fetching saved items:', error);
        }
      }
      setIsLoading(false);
    };

    if (!loading) {
      fetchSavedItems();
    }
  }, [user, loading, isPaidSubscriber]);

  const handleUpgrade = async () => {
    if (!user) return;

    setCheckoutLoading(true);
    try {
      const url = await createCheckoutSession(user.id, window.location.href);
      if (url) {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDeleteSavedBill = async (savedBill: SavedBill) => {
    if (!user) return;

    try {
      await unsaveBill(user.id, savedBill.bill_id);
      setSavedBills(savedBills.filter(bill => bill.id !== savedBill.id));
    } catch (error) {
      console.error('Error deleting saved bill:', error);
    }
  };

  const handleDeleteSavedCongressman = async (savedCongressman: SavedCongressman) => {
    if (!user) return;

    try {
      await unsaveCongressman(user.id, savedCongressman.congressman_id);
      setSavedCongressmen(savedCongressmen.filter(congressman => congressman.id !== savedCongressman.id));
    } catch (error) {
      console.error('Error deleting saved congressman:', error);
    }
  };

  const handleDeleteSavedAgency = async (savedAgency: SavedAgency) => {
    if (!user) return;

    try {
      await unsaveAgency(user.id, savedAgency.agency_id);
      setSavedAgencies(savedAgencies.filter(agency => agency.id !== savedAgency.id));
    } catch (error) {
      console.error('Error deleting saved agency:', error);
    }
  };

  const handleDeleteSavedJudge = async (savedJudge: SavedJudge) => {
    if (!user) return;

    try {
      await unsaveJudge(user.id, savedJudge.judge_id);
      setSavedJudges(savedJudges.filter(judge => judge.id !== savedJudge.id));
    } catch (error) {
      console.error('Error deleting saved judge:', error);
    }
  };

  const handleDeleteSavedCluster = async (savedCluster: SavedCluster) => {
    if (!user) return;

    try {
      await unsaveCluster(user.id, savedCluster.cluster_id);
      setSavedClusters(savedClusters.filter(cluster => cluster.id !== savedCluster.id));
    } catch (error) {
      console.error('Error deleting saved court case:', error);
    }
  };

  const handleDeleteSavedAgencyDocument = async (savedDocument: SavedAgencyDocument) => {
    if (!user) return;

    try {
      await unsaveAgencyDocument(user.id, savedDocument.agency_document_id);
      setSavedAgencyDocuments(savedAgencyDocuments.filter(doc => doc.id !== savedDocument.id));
    } catch (error) {
      console.error('Error deleting saved agency document:', error);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingIndicator size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to view your profile</h1>
          <Link
            href={getLoginUrl(pathname)}
            className="inline-block bg-primary text-white px-4 py-2 rounded hover:bg-primary/90"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Your Profile</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Account Information</h2>
        <div>
          <p><strong>Email:</strong> {user.email}</p>
        </div>
      </div>

      {/* Subscription & Payments Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Subscription & Payments</h2>

        {/* Modern Card Style for Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Tier */}
          <div className={`rounded-lg border p-6 ${!isPaidSubscriber ? 'border-primary' : 'border-gray-300'}`}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Basic</h3>
              {!isPaidSubscriber && (
                <span className="bg-primary text-white text-xs font-semibold px-2.5 py-1 rounded-full">Current Plan</span>
              )}
            </div>
            <p className="text-gray-500 mt-2">Basic access to government data.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                See GovSource information
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                {AI_FREE_USAGE_LIMIT} free GovSource Assistant uses per month
                {!isPaidSubscriber && user && (
                  <span className="text-xs text-gray-500 ml-1">({aiInteractions}/{AI_FREE_USAGE_LIMIT} used)</span>
                )}
              </li>
            </ul>
          </div>
          {/* Pro Tier */}
          <div className={`rounded-lg border p-6 ${isPaidSubscriber ? 'border-primary' : 'border-gray-300'}`}>
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold">Pro</h3>
              <div className="text-right">
                {!isPaidSubscriber && (
                  <p className="text-2xl font-bold text-primary">$1.99<span className="text-sm font-normal text-gray-500">/month</span></p>
                )}
                {isPaidSubscriber && (
                  <span className="bg-primary text-white text-xs font-semibold px-2.5 py-1 rounded-full">Current Plan</span>
                )}
              </div>
            </div>
            <p className="text-gray-500 mt-2">Unlimited GovSource Assistant, personalized alerts, and more.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                All Basic features
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                Unlimited GovSource Assistant usage
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                Personalized alerts
              </li>
            </ul>
            {!isPaidSubscriber && (
              <Button
                onClick={handleUpgrade}
                disabled={checkoutLoading}
                className="mt-6 w-full"
              >
                {checkoutLoading ? 'Processing...' : 'Upgrade to Pro'}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-purple-600">
            <LoadingIndicator size="small" />
          </div>
        ) : isPaidSubscriber ? (
          <div className="mt-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-medium">
                You&apos;re on the <span>Pro plan</span>.
                {subscription?.current_period_end && `It will renew on ${new Date(subscription.current_period_end).toLocaleDateString()}.`}
              </p>
              {isPaidSubscriber && (
                <a
                  href={`https://billing.stripe.com/p/login/7sY4gzcew0Exef437l2ZO00?prefilled_email=${user.email}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  Manage subscription
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-gray-600">You are on the Basic plan.</p>
        )}
      </div>

      <UserPreferencesSection />

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Bills watched</h2>
        {savedBills.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedBills.map((savedBill) => (
              <div key={savedBill.id} className="relative">
                {savedBill.bill && <BillCard bill={savedBill.bill} />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSavedBill(savedBill);
                  }}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/50 hover:bg-red-500 hover:text-white"
                  aria-label="Unsave this bill"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any bills yet.</p>
            <Link href="/bills" className="text-blue-600 hover:underline">
              Browse bills
            </Link>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Congress members watched</h2>
        {savedCongressmen.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedCongressmen.map((savedCongressman) => (
              <div key={savedCongressman.id} className="relative">
                {savedCongressman.congressman && <CongressmanCard congressman={savedCongressman.congressman} />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSavedCongressman(savedCongressman);
                  }}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/50 hover:bg-red-500 hover:text-white"
                  aria-label="Unsave this congressmember"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any congress members yet.</p>
            <Link href="/congressmen" className="text-blue-600 hover:underline">
              Browse members of congress
            </Link>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Agencies watched</h2>
        {savedAgencies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedAgencies.map((savedAgency) => (
              <div key={savedAgency.id} className="relative">
                {savedAgency.agency && <AgencyCard agency={savedAgency.agency} />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSavedAgency(savedAgency);
                  }}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/50 hover:bg-red-500 hover:text-white"
                  aria-label="Unsave this agency"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any agencies yet.</p>
            <Link href="/agencies" className="text-blue-600 hover:underline">
              Browse agencies
            </Link>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Judges watched</h2>
        {savedJudges.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedJudges.map((savedJudge) => (
              <div key={savedJudge.id} className="relative">
                {savedJudge.judge && <JudgeCard judge={savedJudge.judge} />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSavedJudge(savedJudge);
                  }}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/50 hover:bg-red-500 hover:text-white"
                  aria-label="Unsave this judge"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any judges yet.</p>
            <Link href="/judges" className="text-blue-600 hover:underline">
              Browse judges
            </Link>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Court cases watched</h2>
        {savedClusters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedClusters.map((savedCluster) => (
              <div key={savedCluster.id} className="relative">
                {savedCluster.cluster && <CourtCaseCard cluster={savedCluster.cluster} />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSavedCluster(savedCluster);
                  }}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/50 hover:bg-red-500 hover:text-white"
                  aria-label="Unsave this court case"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any court cases yet.</p>
            <Link href="/supreme-court-cases" className="text-blue-600 hover:underline">
              Browse court cases
            </Link>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Agency rules watched</h2>
        {savedAgencyDocuments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedAgencyDocuments.map((savedDocument) => (
              <div key={savedDocument.id} className="relative">
                {savedDocument.agency_document && (
                  <AgencyRuleCard rule={savedDocument.agency_document} />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSavedAgencyDocument(savedDocument);
                  }}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/50 hover:bg-red-500 hover:text-white"
                  aria-label="Unsave this document"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any agency rules yet.</p>
            <Link href="/agency-rules" className="text-blue-600 hover:underline">
              Browse agency rules
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
