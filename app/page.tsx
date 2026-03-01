'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { supabase } from '../utils/supabase/client';
import BillCard from '../components/BillCard';
import LawCard from '../components/LawCard';
import { Bill, Congressman, UserPreferences, SavedBill, SavedCongressman, SavedJudge, SavedAgency, AgencyDocument, Law } from '../types/types';
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
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { getLoginUrl } from '@/utils/utils';
import ExecutiveOrderCard from '../components/ExecutiveOrderCard';
import AgencyRuleCard from '../components/AgencyRuleCard';
import CourtCaseCard from '../components/CourtCaseCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: _authLoading } = useAuth();
  const currentPolicyArea = searchParams.get('policy_area');
  const pathname = usePathname();

  // State for logged-out experience
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPolicyArea, _setSelectedPolicyArea] = useState(currentPolicyArea || '');
  const [selectedSponsor, _setSelectedSponsor] = useState<Congressman | null>(null);

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

  // Popular section state
  const [popularItems, setPopularItems] = useState<any[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);

  // Fetch user data when logged in
  useEffect(() => {
    const fetchUserData = async () => {
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
            sponsor: item.sponsor && item.sponsor.length > 0 ? { congressman: item.sponsor[0].congressman } : undefined,
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

  // Fetch popular items from ranked_item
  useEffect(() => {
    const fetchPopularItems = async () => {
      setPopularLoading(true);
      try {
        // 1. Fetch top 8 ranked items (where ranking_ended_at is null)
        const { data: ranked, error: rankedError } = await supabase
          .from('ranked_item')
          .select('*')
          .is('ranking_ended_at', null)
          .order('rank', { ascending: true })
          .limit(8);
        if (rankedError) throw rankedError;
        if (!ranked || ranked.length === 0) {
          setPopularItems([]);
          setPopularLoading(false);
          return;
        }

        // 2. For each ranked item, fetch the full data
        const fetchItem = async (item: any) => {
          switch (item.item_type) {
            case 'bill': {
              const { data, error } = await supabase
                .from('bill')
                .select(`*, sponsor:sponsored_bills!bill_id(congressman:congressman(*)), actions:bill_action!bill_id(id, date, text, type)`)
                .eq('id', item.item_id)
                .single();
              if (error || !data) return null;
              // Format sponsor and most_recent_action
              const sortedActions = data.actions ? [...data.actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
              return { ...item, item_type: 'bill', data: { ...data, sponsor: data.sponsor && data.sponsor.length > 0 ? { congressman: data.sponsor[0].congressman } : undefined, most_recent_action: sortedActions.length > 0 ? sortedActions[0] : null, actions: undefined } };
            }
            case 'law': {
              const { data, error } = await supabase
                .from('bill')
                .select(`*, sponsor:sponsored_bills!bill_id(congressman:congressman(*)), actions:bill_action!bill_id(id, date, text, type)`)
                .eq('id', item.item_id)
                .not('law_enacted_date', 'is', null)
                .single();
              if (error || !data) return null;
              const sortedActions = data.actions ? [...data.actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
              return { ...item, item_type: 'law', data: { ...data, sponsor: data.sponsor && data.sponsor.length > 0 ? data.sponsor[0].congressman : undefined, most_recent_action: sortedActions.length > 0 ? sortedActions[0] : null, actions: undefined } };
            }
            case 'agency_document': {
              // Fetch agency_document and its agency (if any)
              const { data, error } = await supabase
                .from('agency_document')
                .select(`*, agency_link:agency_agencydocument!agency_document_id(agency:agency(*))`)
                .eq('id', item.item_id)
                .single();
              if (error || !data) return null;
              // Attach agency if available
              let agency = undefined;
              if (data.agency_link && data.agency_link.length > 0 && data.agency_link[0].agency) {
                agency = data.agency_link[0].agency;
              }
              return { ...item, item_type: data.subtype === 'Executive Order' ? 'executive_order' : 'agency_document', data: { ...data, agency } };
            }
            case 'cluster': {
              // Fetch cluster and its opinions (with author)
              const { data, error } = await supabase
                .from('cluster')
                .select(`*, court:court(*), opinions:court_opinion!cluster_id(*, author:judge(*))`)
                .eq('id', item.item_id)
                .single();
              if (error || !data) return null;
              return { ...item, item_type: 'cluster', data };
            }
            case 'executive_order': {
              // Executive orders are stored as agency_document with subtype 'Executive Order'
              const { data, error } = await supabase
                .from('agency_document')
                .select(`*, agency_link:agency_agencydocument!agency_document_id(agency:agency(*))`)
                .eq('id', item.item_id)
                .eq('subtype', 'Executive Order')
                .single();
              if (error || !data) return null;
              let agency = undefined;
              if (data.agency_link && data.agency_link.length > 0 && data.agency_link[0].agency) {
                agency = data.agency_link[0].agency;
              }
              return { ...item, item_type: 'executive_order', data: { ...data, agency } };
            }
            default:
              return null;
          }
        };

        const itemsWithData = await Promise.all(ranked.map(fetchItem));
        // Filter out nulls and items with missing data
        setPopularItems(itemsWithData.filter(Boolean));
      } catch (err) {
        console.error('Error fetching popular items:', err);
        setPopularItems([]);
      } finally {
        setPopularLoading(false);
      }
    };
    fetchPopularItems();
  }, []);

  // Render logged-in user experience
  if (user) {
    return (
      <div className="container mx-auto px-4 py-10">
        {/* Popular Section */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Popular now</h2>
          </div>
          {popularLoading ? (
            <div className="flex justify-center items-center h-32">
              <LoadingIndicator size="large" />
            </div>
          ) : popularItems.length === 0 ? (
            <div className="rounded-lg border border-border/80 bg-card/90 p-4">
              <p className="text-muted-foreground">No popular items found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {popularItems.map((item) => {
                switch (item.item_type) {
                  case 'bill':
                    return <BillCard key={`popular-bill-${item.data.id}`} bill={item.data} />;
                  case 'law':
                    return <LawCard key={`popular-law-${item.data.id}`} law={item.data} />;
                  case 'executive_order':
                    return <ExecutiveOrderCard key={`popular-execorder-${item.data.id}`} order={item.data} />;
                  case 'agency_document':
                    return <AgencyRuleCard key={`popular-agencydoc-${item.data.id}`} rule={item.data} />;
                  case 'cluster':
                    return <CourtCaseCard key={`popular-cluster-${item.data.id}`} cluster={item.data} />;
                  default:
                    return null;
                }
              })}
            </div>
          )}
        </div>

        {/* SEO Content Section for Logged-in Users */}
        <div className="mb-8 rounded-xl border border-border/70 bg-card/90 p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Track Congress Members and Legislative Activities</h2>
          <div className="grid grid-cols-1 gap-6 text-sm text-muted-foreground md:grid-cols-2">
            <div>
              <h3 className="font-medium mb-2">Members of Congress</h3>
              <p className="mb-3">
                Discover and track congress members from all states. 
                Monitor their voting records, sponsored bills, and legislative activities.
              </p>
              <Link href="/congressmen" className="text-primary hover:underline font-medium">
                Browse all Congress members →
              </Link>
            </div>
            <div>
              <h3 className="font-medium mb-2">Legislative Tracking</h3>
              <p className="mb-3">
                Stay informed about the latest bills, laws, and government activities. 
                Track how congress members vote and influence policy decisions.
              </p>
              <Link href="/bills" className="text-primary hover:underline font-medium">
                View recent legislation →
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Legislation in Your Policy Areas */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Your policy areas</h2>
            <Link href="/bills" className="text-sm text-primary hover:underline">
              View all legislation
            </Link>
          </div>
          {userPreferences?.policy_areas && userPreferences.policy_areas.length > 0 ? (
            recentLegislationLoading ? (
              <div className="flex justify-center items-center h-64">
                <LoadingIndicator size="large" />
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
                  <div className="rounded-lg border border-border/80 bg-card/90 p-4">
                    <p className="text-muted-foreground">No recent legislation found in your policy areas.</p>
                    <Link href="/bills" className="text-primary hover:underline mt-2 inline-block">
                      Browse all bills
                    </Link>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="rounded-lg border border-border/80 bg-card/90 p-4">
              <p className="text-muted-foreground">You haven&apos;t selected any policy areas yet.</p>
              <Link href="/profile" className="text-primary hover:underline mt-2 inline-block">
                Update preferences
              </Link>
            </div>
          )}
        </div>

        {/* Your Saved Items */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold">Your Saved Items</h2>

          {/* Tabs */}
          <div className="mb-4 border-b border-border/80">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('bills')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'bills'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                Bills ({savedBills.length})
              </button>
              <button
                onClick={() => setActiveTab('congressmen')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'congressmen'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                Congress members ({savedCongressmen.length})
              </button>
              <button
                onClick={() => setActiveTab('judges')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'judges'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                Judges ({savedJudges.length})
              </button>
              <button
                onClick={() => setActiveTab('agencies')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'agencies'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
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
                  <div className="rounded-lg border border-border/80 bg-card/90 p-4">
                    <p className="text-muted-foreground">You haven&apos;t saved any bills yet.</p>
                    <Link href="/bills" className="text-primary hover:underline mt-2 inline-block">
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
                        <div key={saved.id} className="h-full overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-sm transition-shadow duration-200 hover:shadow-md">
                          <div className="p-4 h-full flex flex-col">
                            <Link
                              href={`/congressmen/${saved.congressman.id}`}
                              className="block mb-2 hover:text-primary transition-colors"
                            >
                              <h3 className="text-lg font-medium text-foreground">
                                {saved.congressman.full_name}
                              </h3>
                            </Link>
                            <div className="mb-2 text-sm text-muted-foreground">
                              {saved.congressman.party} - {saved.congressman.state}
                              {saved.congressman.district && `, District ${saved.congressman.district}`}
                            </div>
                            <div className="mt-auto text-sm text-muted-foreground">
                              {saved.congressman.chamber === 'House' ? 'Representative' : 'Senator'}
                            </div>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/80 bg-card/90 p-4">
                    <p className="text-muted-foreground">You haven&apos;t saved any congress members or congressman yet.</p>
                    <Link href="/congressmen" className="text-primary hover:underline mt-2 inline-block">
                      Browse members of Congress
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
                        <div key={saved.id} className="h-full overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-sm transition-shadow duration-200 hover:shadow-md">
                          <div className="p-4 h-full flex flex-col">
                            <Link
                              href={`/judges/${saved.judge.id}`}
                              className="block mb-2 hover:text-primary transition-colors"
                            >
                              <h3 className="text-lg font-medium text-foreground">
                                {saved.judge.full_name}
                              </h3>
                            </Link>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/80 bg-card/90 p-4">
                    <p className="text-muted-foreground">You haven&apos;t saved any judges yet.</p>
                    <Link href="/judges" className="text-primary hover:underline mt-2 inline-block">
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
                        <div key={saved.id} className="h-full overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-sm transition-shadow duration-200 hover:shadow-md">
                          <div className="p-4 h-full flex flex-col">
                            <Link
                              href={`/agencies/${saved.agency.id}`}
                              className="block mb-2 hover:text-primary transition-colors"
                            >
                              <h3 className="text-lg font-medium text-foreground">
                                {saved.agency.name}
                              </h3>
                            </Link>
                            {saved.agency.description && (
                              <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                                {saved.agency.description}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/80 bg-card/90 p-4">
                    <p className="text-muted-foreground">You haven&apos;t saved any agencies yet.</p>
                    <Link href="/agencies" className="text-primary hover:underline mt-2 inline-block">
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
            <h2 className="text-2xl font-bold">Executive Orders</h2>
            <Link href="/executive-orders" className="text-sm text-primary hover:underline">
              View executive orders
            </Link>
          </div>

          {recentExecutiveOrders.length > 0 ? (
            <div className="space-y-4">
              {recentExecutiveOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link
                        href={`/executive-orders/${order.id}`}
                        className="text-lg font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {order.title}
                      </Link>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {order.signing_date && (
                          <span>Signed on {new Date(order.signing_date).toLocaleDateString()}</span>
                        )}
                        {order.president && (
                          <span> by President {order.president}</span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        Executive Order
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border/80 bg-card/90 p-4">
              <p className="text-muted-foreground">No recent executive orders found.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render logged-out experience
  return (
    <div className="container mx-auto px-4 py-10">
      {/* Welcome Section */}
      <Card className="mb-8 border-0 bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-lg">
        <CardHeader className="pb-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className="border-primary-foreground/20 bg-primary-foreground/15 text-primary-foreground">
              Federal Source Data
            </Badge>
            <Badge className="border-primary-foreground/20 bg-primary-foreground/15 text-primary-foreground">
              AI-Powered Tracking
            </Badge>
          </div>
          <CardTitle className="text-3xl md:text-4xl">Welcome to GovSource</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-w-3xl text-primary-foreground/90 md:text-base">
            See the source of US federal legislation, executive orders, court cases, and more. Track members of congress, congressman activities, and legislative developments.
          </p>
          <div className="mt-6">
            <Link href={getLoginUrl(pathname)}>
              <Button
                variant="outline"
                className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
              >
                Start Tracking
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Popular Section (moved below Welcome) */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Popular now</h2>
        </div>
        {popularLoading ? (
          <div className="flex justify-center items-center h-32">
            <LoadingIndicator size="large" />
          </div>
        ) : popularItems.length === 0 ? (
          <div className="rounded-lg border border-border/80 bg-card/90 p-4">
            <p className="text-muted-foreground">No popular items found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularItems.map((item) => {
              switch (item.item_type) {
                case 'bill':
                  return <BillCard key={`popular-bill-${item.data.id}`} bill={item.data} />;
                case 'law':
                  return <LawCard key={`popular-law-${item.data.id}`} law={item.data} />;
                case 'executive_order':
                  return <ExecutiveOrderCard key={`popular-execorder-${item.data.id}`} order={item.data} />;
                case 'agency_document':
                  return <AgencyRuleCard key={`popular-agencydoc-${item.data.id}`} rule={item.data} />;
                case 'cluster':
                  return <CourtCaseCard key={`popular-cluster-${item.data.id}`} cluster={item.data} />;
                default:
                  return null;
              }
            })}
          </div>
        )}
      </div>

      {/* Why Sign Up Section */}
      <Card className="mb-8 border-border/80 bg-card/95">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Sign in to:</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Save and track government information including congress members and their activities</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Access advanced AI-powered analysis on laws, bills, executive orders, and more</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Track congress members voting records and legislative history</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Get personalized legislative updates (coming soon)</span>
            </li>
          </ul>
          <div className="mt-7">
            <Link href={getLoginUrl(pathname)}>
              <Button>Sign In</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Executive Orders */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Recent Executive Orders</h2>
          <Link href="/executive-orders" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {recentExecutiveOrders.length > 0 ? (
          <div className="space-y-4">
            {recentExecutiveOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <Link
                      href={`/executive-orders/${order.id}`}
                      className="text-lg font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {order.title}
                    </Link>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {order.signing_date && (
                        <span>Signed on {new Date(order.signing_date).toLocaleDateString()}</span>
                      )}
                      {order.president && (
                        <span> by President {order.president}</span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      Executive Order
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/80 bg-card/90 p-4">
            <p className="text-muted-foreground">No recent executive orders found.</p>
          </div>
        )}
      </div>

      {/* SEO Content Section */}
      <div className="mb-8 rounded-xl border border-border/70 bg-card/90 p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Track congress members and legislative activities</h2>
        <div className="grid grid-cols-1 gap-6 text-sm text-muted-foreground md:grid-cols-2">
          <div>
            <h3 className="font-medium mb-2">Members of Congress</h3>
            <p className="mb-3">
              Discover and track congress members from all states. 
              Monitor their voting records, sponsored bills, and legislative activities.
            </p>
            <Link href="/congressmen" className="text-primary hover:underline font-medium">
              Browse all Congress members →
            </Link>
          </div>
          <div>
            <h3 className="font-medium mb-2">Legislative Tracking</h3>
            <p className="mb-3">
              Stay informed about the latest bills, laws, and government activities. 
              Track how congress members vote and influence policy decisions.
            </p>
            <Link href="/bills" className="text-primary hover:underline font-medium">
              View recent legislation →
            </Link>
          </div>
        </div>
      </div>

      {/* Bills Filter/Search and Grid */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Recent Legislation</h2>
          <Link href="/bills" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
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
            <div className="rounded-lg border border-border/80 bg-card/90 p-4">
              <p className="text-muted-foreground">
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
      <LoadingIndicator size="large" />
    </div>}>
      <HomeContent />
    </Suspense>
  );
}
