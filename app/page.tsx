'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { createClient } from '../lib/supabase';
import BillCard from '../components/BillCard';
import LawCard from '../components/LawCard';
import { CongressmanSearchSelectRef } from '../components/CongressmanSearchSelect';
import { Bill, Congressman, UserPreferences, SavedBill, SavedCongressman, SavedJudge, SavedAgency, SavedAgencyDocument, SavedCluster, AgencyDocument, Law } from '../types/types';
import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import {
  getSavedBills,
  getSavedCongressmen,
  getSavedJudges,
  getSavedAgencies,
  getUserPreferences,
  getBills,
  getAgencyRules
} from '../services/api';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const currentPolicyArea = searchParams.get('policy_area');
  const pathname = usePathname();

  // State for logged-out experience
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPolicyArea, setSelectedPolicyArea] = useState(currentPolicyArea || '');
  const [selectedSponsor, setSelectedSponsor] = useState<Congressman | null>(null);
  const congressmanSearchRef = useRef<CongressmanSearchSelectRef>(null);

  // State for logged-in experience
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [savedBills, setSavedBills] = useState<SavedBill[]>([]);
  const [savedCongressmen, setSavedCongressmen] = useState<SavedCongressman[]>([]);
  const [savedJudges, setSavedJudges] = useState<SavedJudge[]>([]);
  const [savedAgencies, setSavedAgencies] = useState<SavedAgency[]>([])
  const [recentExecutiveOrders, setRecentExecutiveOrders] = useState<AgencyDocument[]>([]);
  const [activeTab, setActiveTab] = useState('bills');

  // State for recent legislation
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [recentLaws, setRecentLaws] = useState<Law[]>([]);
  const [recentLegislationLoading, setRecentLegislationLoading] = useState(false);

  // Fetch user data when logged in
  useEffect(() => {
    const fetchUserData = async () => {
      const supabase = createClient();
      if (!user) return;

      try {
        // Fetch user preferences
        const preferences = await getUserPreferences(user.id);
        setUserPreferences(preferences);

        // Fetch saved items
        const [bills, congressmen, judges, agencies] = await Promise.all([
          getSavedBills(user.id),
          getSavedCongressmen(user.id),
          getSavedJudges(user.id),
          getSavedAgencies(user.id),
        ]);

        setSavedBills(bills);
        setSavedCongressmen(congressmen);
        setSavedJudges(judges);
        setSavedAgencies(agencies);
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    if (user) {
      fetchUserData();
    }
  }, [user]);

  // Fetch recent executive orders
  useEffect(() => {
    const fetchExecutiveOrders = async () => {
      try {
        const orders = await getAgencyRules({
          subtype: 'Executive Order',
          limit: 5,
          sort_order: 'desc'
        });
        setRecentExecutiveOrders(orders);
      } catch (error) {
        console.error('Error fetching executive orders:', error);
      }
    };

    fetchExecutiveOrders();
  }, []);

  // Fetch bills when policy area changes
  useEffect(() => {
    const fetchBills = async () => {
      setLoading(true);
      try {
        // Build query parameters
        const params: any = { limit: 12 };

        if (selectedPolicyArea) {
          params.policy_area = selectedPolicyArea;
        }

        if (selectedSponsor) {
          params.sponsor_id = selectedSponsor.id;
        }

        // Fetch bills with filters
        const data = await getBills(params);
        setBills(data);
      } catch (error) {
        console.error('Error fetching bills:', error);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch for logged-out experience
    if (!user) {
      fetchBills();
    }

    // Update URL with filters
    if (selectedPolicyArea || selectedSponsor) {
      const params = new URLSearchParams();
      if (selectedPolicyArea) params.set('policy_area', selectedPolicyArea);
      if (selectedSponsor) params.set('sponsor_id', selectedSponsor.id.toString());
      router.push(`/?${params.toString()}`, { scroll: false });
    } else {
      router.push('/', { scroll: false });
    }
  }, [selectedPolicyArea, selectedSponsor, router, user]);

  // Fetch recent legislation in user's policy areas
  useEffect(() => {
    const fetchRecentLegislation = async () => {
      const supabase = createClient();
      if (!user || !userPreferences || !userPreferences.policy_areas || userPreferences.policy_areas.length === 0) return;

      setRecentLegislationLoading(true);
      try {
        // Make a single query to fetch all recent legislation (both bills and laws)
        // with their actions and sponsor information
        const { data: recentLegislationData, error } = await supabase
          .from('bill')
          .select(`
            *,
            sponsor:sponsored_bills!bill_id(
              congressman:congressman(*)
            ),
            actions:bill_action!bill_id(
              id,
              date,
              text,
              type
            )
          `)
          .in('policy_area', userPreferences.policy_areas)
          .order('introduced_date', { ascending: false })
          .limit(8); // Fetch more items since we'll be splitting them

        if (error) throw error;

        // Process all legislation data to include the most recent action and format sponsor
        const processedLegislationData = recentLegislationData.map(item => {
          // Sort actions by date (descending) and get the most recent one
          const sortedActions = item.actions ?
            [...item.actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) :
            [];

          return {
            ...item,
            // Format sponsor to match the expected structure
            sponsor: item.sponsor && item.sponsor.length > 0 ?
              item.sponsor[0].congressman :
              undefined,
            // Add most recent action
            most_recent_action: sortedActions.length > 0 ? sortedActions[0] : null,
            // Remove the actions array to keep the response clean
            actions: undefined
          };
        });

        // Separate bills and laws based on whether law_enacted_date is null
        const bills = processedLegislationData.filter(item => !item.law_enacted_date);
        const laws = processedLegislationData.filter(item => item.law_enacted_date);

        // Set the data
        setRecentBills(bills);
        setRecentLaws(laws);
      } catch (error) {
        console.error('Error fetching recent legislation:', error);
      } finally {
        setRecentLegislationLoading(false);
      }
    };

    fetchRecentLegislation();
  }, [user, userPreferences]);

  const handlePolicyAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedPolicyArea(value);

    // Update URL query params
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('policy_area', value);
    } else {
      params.delete('policy_area');
    }

    router.push(`/?${params.toString()}`);
  };

  const handleSponsorSelect = (congressman: Congressman | null) => {
    setSelectedSponsor(congressman);
  };

  const clearFilters = () => {
    setSelectedPolicyArea('');
    setSelectedSponsor(null);
    // Clear the congressman search input
    if (congressmanSearchRef.current) {
      congressmanSearchRef.current.clear();
    }
    router.push('/');
  };

  // Render logged-in user experience
  if (user) {
    return (
      <div className="container mx-auto px-4 py-8">
        {/* Recent Legislation in Your Policy Areas */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Legislative updates in your policy areas</h2>
            <Link href="/bills" className="text-sm text-blue-600 hover:underline">
              View all legislation
            </Link>
          </div>
          {userPreferences?.policy_areas && userPreferences.policy_areas.length > 0 ? (
            recentLegislationLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-xl">Loading...</div>
              </div>
            ) : (
              <div>
                {recentBills.length > 0 || recentLaws.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Combined and sorted bills and laws by most recent action date */}
                    {[
                      ...recentBills.map(bill => ({ type: 'bill', data: bill })),
                      ...recentLaws.map(law => ({ type: 'law', data: law as Law }))
                    ]
                      .sort((a, b) => {
                        // Get the action dates or default to a very old date if no action
                        const dateA = a.data.most_recent_action?.date ? new Date(a.data.most_recent_action.date).getTime() : 0;
                        const dateB = b.data.most_recent_action?.date ? new Date(b.data.most_recent_action.date).getTime() : 0;
                        return dateB - dateA; // Sort descending (newest first)
                      })
                      .map(item => (
                        item.type === 'bill' ?
                          <BillCard key={`bill-${item.data.id}`} bill={item.data as Bill} /> :
                          <LawCard key={`law-${item.data.id}`} law={item.data as Law} />
                      ))
                    }
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <p className="text-gray-700">No recent legislation found in your policy areas.</p>
                    <Link href="/bills" className="text-blue-600 hover:underline mt-2 inline-block">
                      Browse all bills
                    </Link>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <p className="text-gray-700">You haven&apos;t selected any policy areas yet.</p>
              <Link href="/profile" className="text-blue-600 hover:underline mt-2 inline-block">
                Update preferences
              </Link>
            </div>
          )}
        </div>

        {/* Your Saved Items */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Your Saved Items</h2>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('bills')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'bills'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Bills ({savedBills.length})
              </button>
              <button
                onClick={() => setActiveTab('congressmen')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'congressmen'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Congressmembers ({savedCongressmen.length})
              </button>
              <button
                onClick={() => setActiveTab('judges')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'judges'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Judges ({savedJudges.length})
              </button>
              <button
                onClick={() => setActiveTab('agencies')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'agencies'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Agencies ({savedAgencies.length})
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'bills' && (
              <>
                {savedBills.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedBills.map((savedBill) => (
                      savedBill.bill && <BillCard key={savedBill.id} bill={savedBill.bill} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <p className="text-gray-700">You haven&apos;t saved any bills yet.</p>
                    <Link href="/bills" className="text-blue-600 hover:underline mt-2 inline-block">
                      Browse bills
                    </Link>
                  </div>
                )}
              </>
            )}

            {activeTab === 'congressmen' && (
              <>
                {savedCongressmen.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedCongressmen.map((saved) => (
                      saved.congressman && (
                        <div key={saved.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full hover:shadow-md transition-shadow duration-200">
                          <div className="p-4 h-full flex flex-col">
                            <Link
                              href={`/congressmen/${saved.congressman.id}`}
                              className="block mb-2 hover:text-blue-600 transition-colors"
                            >
                              <h3 className="text-lg font-medium text-gray-900">
                                {saved.congressman.full_name}
                              </h3>
                            </Link>
                            <div className="text-sm text-gray-600 mb-2">
                              {saved.congressman.party} - {saved.congressman.state}
                              {saved.congressman.district && `, District ${saved.congressman.district}`}
                            </div>
                            <div className="text-sm text-gray-600 mt-auto">
                              {saved.congressman.chamber === 'House' ? 'Representative' : 'Senator'}
                            </div>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <p className="text-gray-700">You haven&apos;t saved any congressmen yet.</p>
                    <Link href="/congressmen" className="text-blue-600 hover:underline mt-2 inline-block">
                      Browse congressmen
                    </Link>
                  </div>
                )}
              </>
            )}

            {activeTab === 'judges' && (
              <>
                {savedJudges.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedJudges.map((saved) => (
                      saved.judge && (
                        <div key={saved.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full hover:shadow-md transition-shadow duration-200">
                          <div className="p-4 h-full flex flex-col">
                            <Link
                              href={`/judges/${saved.judge.id}`}
                              className="block mb-2 hover:text-blue-600 transition-colors"
                            >
                              <h3 className="text-lg font-medium text-gray-900">
                                {saved.judge.full_name}
                              </h3>
                            </Link>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <p className="text-gray-700">You haven&apos;t saved any judges yet.</p>
                    <Link href="/judges" className="text-blue-600 hover:underline mt-2 inline-block">
                      Browse judges
                    </Link>
                  </div>
                )}
              </>
            )}

            {activeTab === 'agencies' && (
              <>
                {savedAgencies.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedAgencies.map((saved) => (
                      saved.agency && (
                        <div key={saved.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full hover:shadow-md transition-shadow duration-200">
                          <div className="p-4 h-full flex flex-col">
                            <Link
                              href={`/agencies/${saved.agency.id}`}
                              className="block mb-2 hover:text-blue-600 transition-colors"
                            >
                              <h3 className="text-lg font-medium text-gray-900">
                                {saved.agency.name}
                              </h3>
                            </Link>
                            {saved.agency.description && (
                              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                                {saved.agency.description}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <p className="text-gray-700">You haven&apos;t saved any agencies yet.</p>
                    <Link href="/agencies" className="text-blue-600 hover:underline mt-2 inline-block">
                      Browse agencies
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Recent Executive Orders */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Executive Orders</h2>
            <Link href="/executive-orders" className="text-sm text-blue-600 hover:underline">
              View executive orders
            </Link>
          </div>

          {recentExecutiveOrders.length > 0 ? (
            <div className="space-y-4">
              {recentExecutiveOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link
                        href={`/executive-orders/${order.id}`}
                        className="text-lg font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {order.title}
                      </Link>
                      <div className="mt-1 text-sm text-gray-600">
                        {order.signing_date && (
                          <span>Signed on {new Date(order.signing_date).toLocaleDateString()}</span>
                        )}
                        {order.president && (
                          <span> by President {order.president}</span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        Executive Order
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <p className="text-gray-700">No recent executive orders found.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render logged-out experience
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-lg shadow-md p-6 mb-8 text-white">
        <h1 className="text-2xl font-bold mb-2">Welcome to GovSource!</h1>
        <p className="mb-4">Discover, track, and understand US federal legislation, court cases, and more.</p>
      </div>

      {/* Why Sign Up Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8 border border-gray-200">
        <h2 className="text-xl font-semibold mb-2 text-gray-900">Sign up to:</h2>
        <ul className="list-disc pl-5 mb-4 text-gray-700">
          <li>Save and track government information</li>
          <li>Access advanced AI-powered analysis on laws, bills, executive orders, and more</li>
          <li>Get personalized legislative updates (coming soon)</li>
        </ul>
        <div className="flex space-x-3">
          <Link href="/signup" className="inline-block px-4 py-2 bg-blue-700 text-white rounded-md font-medium hover:bg-blue-700 transition-colors">Sign Up</Link>
          <Link href={`/login?redirect=${encodeURIComponent(pathname)}`} className="inline-block px-4 py-2 bg-gray-100 text-blue-700 rounded-md font-medium hover:bg-gray-200 transition-colors">Log In</Link>
        </div>
      </div>

      {/* Recent Executive Orders */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent Executive Orders</h2>
          <Link href="/executive-orders" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {recentExecutiveOrders.length > 0 ? (
          <div className="space-y-4">
            {recentExecutiveOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Link
                      href={`/executive-orders/${order.id}`}
                      className="text-lg font-medium text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {order.title}
                    </Link>
                    <div className="mt-1 text-sm text-gray-600">
                      {order.signing_date && (
                        <span>Signed on {new Date(order.signing_date).toLocaleDateString()}</span>
                      )}
                      {order.president && (
                        <span> by President {order.president}</span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      Executive Order
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <p className="text-gray-700">No recent executive orders found.</p>
          </div>
        )}
      </div>

      {/* Bills Filter/Search and Grid */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent Legislation</h2>
          <Link href="/bills" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-xl">Loading...</div>
        </div>
      ) : (
        <>
          {bills.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bills.map((bill) => (
                <BillCard key={bill.id} bill={bill} />
              ))}
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-700">
                No bills found.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <div className="text-xl">Loading...</div>
    </div>}>
      <HomeContent />
    </Suspense>
  );
}
