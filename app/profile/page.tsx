'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSavedBills, getSavedCongressmen, getSavedAgencies,
  getSavedJudges, getSavedClusters, getSavedAgencyDocuments,
  unsaveBill, unsaveCongressman, unsaveAgency,
  unsaveJudge, unsaveCluster, unsaveAgencyDocument,
  getUserSubscription, getUserPayments, cancelSubscription
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
  Subscription, Payment
} from '../../types/types';
import Link from 'next/link';
import UserPreferencesSection from '../../components/UserPreferencesSection';
import { usePathname } from 'next/navigation';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

function ConfirmModal({ open, onConfirm, onCancel, loading }: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4">Cancel Subscription</h2>
        <p className="mb-6">Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.</p>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
            onClick={onCancel}
            disabled={loading}
          >
            No, keep it
          </button>
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Cancelling..." : "Yes, cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [savedBills, setSavedBills] = useState<SavedBill[]>([]);
  const [savedCongressmen, setSavedCongressmen] = useState<SavedCongressman[]>([]);
  const [savedAgencies, setSavedAgencies] = useState<SavedAgency[]>([]);
  const [savedJudges, setSavedJudges] = useState<SavedJudge[]>([]);
  const [savedClusters, setSavedClusters] = useState<SavedCluster[]>([]);
  const [savedAgencyDocuments, setSavedAgencyDocuments] = useState<SavedAgencyDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
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

    const fetchSubscription = async () => {
      if (user) {
        setSubLoading(true);
        try {
          const sub = await getUserSubscription(user.id);
          setSubscription(sub || null);
          if (sub) {
            const pays = await getUserPayments(user.id);
            setPayments(pays || []);
          } else {
            setPayments([]);
          }
        } catch (err) {
          setSubscription(null);
          setPayments([]);
        } finally {
          setSubLoading(false);
        }
      }
    };

    if (!loading) {
      fetchSavedItems();
      if (user) fetchSubscription();
    }
  }, [user, loading]);

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

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      await cancelSubscription(subscription.stripe_subscription_id);
      // Optionally, refetch subscription status here
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to view your profile</h1>
          <Link
            href={`/login?redirect=${encodeURIComponent(pathname)}`}
            className="inline-block bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-700"
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
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          {/* Free Tier Card */}
          <div
            className={`flex-1 flex flex-col border rounded-lg p-6 transition-all relative ${
              !subscription || subscription.tier === 'free'
                ? 'ring-2 ring-blue-500 bg-blue-50'
                : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold text-gray-700">Basic</h3>
              {(!subscription || subscription.tier === 'free') && (
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">
                  <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                  Current
                </span>
              )}
            </div>
            <p className="text-3xl font-bold mb-4">Free</p>
            <ul className="list-disc pl-5 text-gray-700 mb-4">
              <li>Access to GovSource&apos;s information</li>
            </ul>
          </div>
          {/* Paid Tier Card */}
          <div
            className={`flex-1 flex flex-col border rounded-lg p-6 transition-all relative ${
              subscription?.tier === 'paid'
                ? 'ring-2 ring-purple-500 bg-purple-50'
                : 'bg-purple-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold text-purple-700">Pro</h3>
              {subscription?.tier === 'paid' && (
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">
                  <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                  Current
                </span>
              )}
            </div>
            <p className="text-3xl font-bold mb-4">$4.99<span className="text-lg font-medium text-gray-500">/month</span></p>
            <ul className="list-disc pl-5 text-purple-800 mb-4">
              <li>Access to AI</li>
              <li>No ads</li>
              <li>Notifications (coming soon)</li>
              <li>Digest (coming soon)</li>
            </ul>
            
            {/* Action Button in Paid Plan Box */}
            {subLoading ? (
              <div className="text-sm text-purple-600">Loading...</div>
            ) : (
              <div className="mt-auto pt-4">
                {/* Show Subscribe button if user is on free plan */}
                {(!subscription || subscription.tier === 'free') && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!user) return;
                      setCancelLoading(true);
                      try {
                        const res = await fetch('/api/create-checkout-session', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: user.id }),
                        });
                        const data = await res.json();
                        if (data.url) {
                          window.location.href = data.url;
                        } else {
                          alert('Failed to create checkout session.');
                        }
                      } catch (err) {
                        alert('Failed to create checkout session.');
                      } finally {
                        setCancelLoading(false);
                      }
                    }}
                    className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors disabled:opacity-50"
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? 'Redirecting...' : 'Subscribe'}
                  </button>
                )}
                {/* Show Cancel Subscription button if user is on paid plan */}
                {subscription?.tier === 'paid' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCancelModal(true);
                    }}
                    className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Current Period End and Cancel Notice */}
        {subscription && (
          <div className="mb-4 text-center">
            {subscription.current_period_end && (
              <p><strong>Current Period Ends:</strong> {new Date(subscription.current_period_end).toLocaleString()}</p>
            )}
            {subscription.cancel_at_period_end && (
              <p className="text-yellow-600">Subscription will cancel at period end.</p>
            )}
          </div>
        )}

        {/* Cancel Modal */}
        <ConfirmModal
          open={showCancelModal}
          loading={cancelLoading}
          onCancel={() => setShowCancelModal(false)}
          onConfirm={async () => {
            setCancelLoading(true);
            setCancelError(null);
            try {
              await handleCancelSubscription();
              setShowCancelModal(false);
              // Optionally, refetch subscription status here
            } catch (err: any) {
              setCancelError(err.message || 'Failed to cancel subscription');
            } finally {
              setCancelLoading(false);
            }
          }}
        />
        {cancelError && <div className="text-red-600 mt-2 text-center">{cancelError}</div>}
      </div>

      <UserPreferencesSection />

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Bills watched</h2>
        {savedBills.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedBills.map((savedBill) => (
              <div key={savedBill.id} className="relative group">
                {savedBill.bill && <BillCard bill={savedBill.bill} />}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSavedBill(savedBill);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center shadow-md transition-all pointer-events-auto"
                    aria-label="Unsave this bill"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unsave
                  </button>
                </div>
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
        <h2 className="text-2xl font-semibold mb-4">Congressmembers watched</h2>
        {savedCongressmen.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedCongressmen.map((savedCongressman) => (
              <div key={savedCongressman.id} className="relative group">
                {savedCongressman.congressman && <CongressmanCard congressman={savedCongressman.congressman} />}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSavedCongressman(savedCongressman);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center shadow-md transition-all pointer-events-auto"
                    aria-label="Unsave this congressmember"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unsave
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-lg text-gray-600 mb-4">You haven&apos;t saved any congressmembers yet.</p>
            <Link href="/congressmen" className="text-blue-600 hover:underline">
              Browse congressmen
            </Link>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Agencies watched</h2>
        {savedAgencies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedAgencies.map((savedAgency) => (
              <div key={savedAgency.id} className="relative group">
                {savedAgency.agency && <AgencyCard agency={savedAgency.agency} />}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSavedAgency(savedAgency);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center shadow-md transition-all pointer-events-auto"
                    aria-label="Unsave this agency"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unsave
                  </button>
                </div>
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
              <div key={savedJudge.id} className="relative group">
                {savedJudge.judge && <JudgeCard judge={savedJudge.judge} />}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSavedJudge(savedJudge);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center shadow-md transition-all pointer-events-auto"
                    aria-label="Unsave this judge"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unsave
                  </button>
                </div>
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
              <div key={savedCluster.id} className="relative group">
                {savedCluster.cluster && <CourtCaseCard cluster={savedCluster.cluster} />}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSavedCluster(savedCluster);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center shadow-md transition-all pointer-events-auto"
                    aria-label="Unsave this court case"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unsave
                  </button>
                </div>
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
              <div key={savedDocument.id} className="relative group">
                {savedDocument.agency_document && (
                  <AgencyRuleCard rule={savedDocument.agency_document} />
                )}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSavedAgencyDocument(savedDocument);
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center shadow-md transition-all pointer-events-auto"
                    aria-label="Unsave this document"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unsave
                  </button>
                </div>
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
