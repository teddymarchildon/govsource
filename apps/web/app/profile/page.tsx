'use client';

import { Suspense, useEffect, useState } from 'react';
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
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { BookmarkMinus, ArrowRight, Check } from 'lucide-react';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { getLoginUrl } from '@/utils/utils';
import { AI_FREE_USAGE_LIMIT } from '@/constants/onboarding';

function ProfileContent() {
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
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'watching';
  const activeSection = ['watching', 'preferences', 'account'].includes(section) ? section : 'watching';
  const [category, setCategory] = useState('bills');
  const [savedError, setSavedError] = useState('');
  const [actionError, setActionError] = useState('');
  const [retry, setRetry] = useState(0);
  const categories = [
    { id: 'bills', label: 'Bills', count: savedBills.length },
    { id: 'congress', label: 'Congress members', count: savedCongressmen.length },
    { id: 'agencies', label: 'Agencies', count: savedAgencies.length },
    { id: 'judges', label: 'Judges', count: savedJudges.length },
    { id: 'cases', label: 'Court cases', count: savedClusters.length },
    { id: 'rules', label: 'Agency rules', count: savedAgencyDocuments.length },
  ];

  useEffect(() => {
    const fetchSavedItems = async () => {
      if (user) {
        setIsLoading(true);
        setSavedError('');
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
          setSavedError('We couldn’t load your watched items. Please try again.');
        }
      }
      setIsLoading(false);
    };

    if (!loading) {
      fetchSavedItems();
    }
  }, [user, loading, retry]);

  const handleUpgrade = async () => {
    if (!user) return;

    setActionError('');
    setCheckoutLoading(true);
    try {
      const url = await createCheckoutSession();
      if (url) {
        window.location.assign(url);
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setActionError('We couldn’t open checkout. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDeleteSavedBill = async (savedBill: SavedBill) => {
    if (!user) return;
    setActionError('');

    try {
      await unsaveBill(user.id, savedBill.bill_id);
      setSavedBills(current => current.filter(bill => bill.id !== savedBill.id));
    } catch (error) {
      console.error('Error deleting saved bill:', error);
      setActionError('We couldn’t remove that item. Please try again.');
    }
  };

  const handleDeleteSavedCongressman = async (savedCongressman: SavedCongressman) => {
    if (!user) return;
    setActionError('');

    try {
      await unsaveCongressman(user.id, savedCongressman.congressman_id);
      setSavedCongressmen(current => current.filter(congressman => congressman.id !== savedCongressman.id));
    } catch (error) {
      console.error('Error deleting saved Congress member:', error);
      setActionError('We couldn’t remove that item. Please try again.');
    }
  };

  const handleDeleteSavedAgency = async (savedAgency: SavedAgency) => {
    if (!user) return;
    setActionError('');

    try {
      await unsaveAgency(user.id, savedAgency.agency_id);
      setSavedAgencies(current => current.filter(agency => agency.id !== savedAgency.id));
    } catch (error) {
      console.error('Error deleting saved agency:', error);
      setActionError('We couldn’t remove that item. Please try again.');
    }
  };

  const handleDeleteSavedJudge = async (savedJudge: SavedJudge) => {
    if (!user) return;
    setActionError('');

    try {
      await unsaveJudge(user.id, savedJudge.judge_id);
      setSavedJudges(current => current.filter(judge => judge.id !== savedJudge.id));
    } catch (error) {
      console.error('Error deleting saved judge:', error);
      setActionError('We couldn’t remove that item. Please try again.');
    }
  };

  const handleDeleteSavedCluster = async (savedCluster: SavedCluster) => {
    if (!user) return;
    setActionError('');

    try {
      await unsaveCluster(user.id, savedCluster.cluster_id);
      setSavedClusters(current => current.filter(cluster => cluster.id !== savedCluster.id));
    } catch (error) {
      console.error('Error deleting saved court case:', error);
      setActionError('We couldn’t remove that item. Please try again.');
    }
  };

  const handleDeleteSavedAgencyDocument = async (savedDocument: SavedAgencyDocument) => {
    if (!user) return;
    setActionError('');

    try {
      await unsaveAgencyDocument(user.id, savedDocument.agency_document_id);
      setSavedAgencyDocuments(current => current.filter(doc => doc.id !== savedDocument.id));
    } catch (error) {
      console.error('Error deleting saved agency document:', error);
      setActionError('We couldn’t remove that item. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingIndicator size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="-mx-4 md:-mx-6"><div className="container mx-auto px-4 py-8">
        <div className="border-y border-border bg-card px-6 py-12 text-center">
          <h1 className="font-serif text-3xl font-semibold mb-4">Sign in to your account</h1>
          <Link
            href={getLoginUrl(pathname)}
            className="inline-block bg-primary text-white px-4 py-2 rounded hover:bg-primary/90"
          >
            Sign In
          </Link>
        </div>
      </div></div>
    );
  }

  return (
    <div className="-mx-4 md:-mx-6"><div className="container mx-auto px-4 py-8">
      <div className="mb-6 border-b-2 border-foreground pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">GovSource</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Your account</h1>
        <p className="mt-3 text-sm text-muted-foreground">Keep track of the official record and make GovSource your own.</p>
      </div>
      <nav aria-label="Account sections" className="mb-8 flex gap-4 overflow-x-auto border-b border-border sm:gap-8">
        {[
          { id: 'watching', label: 'Watching', href: '/profile' },
          { id: 'preferences', label: 'Preferences', href: '/profile?section=preferences' },
          { id: 'account', label: 'Account & billing', href: '/profile?section=account' },
        ].map((item) => (
          <Link key={item.id} href={item.href} scroll={false} aria-current={activeSection === item.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeSection === item.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      {actionError && <p role="alert" className="mb-5 rounded-md border border-destructive/30 p-4 text-sm text-destructive">{actionError}</p>}
      {activeSection === 'preferences' && <UserPreferencesSection />}
      {activeSection === 'account' && (
        <div className="max-w-3xl space-y-10">
          <section aria-labelledby="account-details">
            <h2 id="account-details" className="border-b border-border pb-3 font-serif text-2xl">Account details</h2>
            <dl className="py-5 sm:grid sm:grid-cols-[12rem_1fr]">
              <dt className="text-sm text-muted-foreground">Email address</dt>
              <dd className="mt-1 break-all text-sm font-medium sm:mt-0">{user.email}</dd>
            </dl>
          </section>
          <section aria-labelledby="plan-heading">
            <h2 id="plan-heading" className="border-b border-border pb-3 font-serif text-2xl">Plan & usage</h2>
            <div className="my-5 rounded-md border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">{isPaidSubscriber ? 'Pro' : 'Basic'}</h3>
                <span className="rounded-sm bg-secondary px-2 py-1 text-xs font-medium">Current plan</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{isPaidSubscriber ? 'Unlimited access to GovSource Assistant.' : 'Access to public records and monthly GovSource Assistant uses.'}</p>
              <div className="mt-5 border-t border-border pt-5">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>GovSource Assistant</span>
                  <span className="font-medium">{isPaidSubscriber ? 'Unlimited' : `${aiInteractions} of ${AI_FREE_USAGE_LIMIT} used this month`}</span>
                </div>
                {!isPaidSubscriber && <progress aria-label="Monthly GovSource Assistant usage" value={Math.min(aiInteractions, AI_FREE_USAGE_LIMIT)} max={AI_FREE_USAGE_LIMIT} className="mt-3 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />}
                {isPaidSubscriber && subscription?.current_period_end && <p className="mt-3 text-sm text-muted-foreground">Current billing period ends {new Date(subscription.current_period_end).toLocaleDateString()}.</p>}
              </div>
              {isPaidSubscriber && <a href={`https://billing.stripe.com/p/login/7sY4gzcew0Exef437l2ZO00?prefilled_email=${encodeURIComponent(user.email || '')}`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Manage subscription <ArrowRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
            </div>
            <details className="group border-b border-border pb-5">
              <summary className="cursor-pointer text-sm font-semibold text-primary">{isPaidSubscriber ? 'Compare plan features' : 'Explore Pro'}<span className="ml-2 font-normal text-muted-foreground">Plan details and pricing</span></summary>
              <div className="pt-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Tier */}
          <div className={`rounded-lg border p-6 ${!isPaidSubscriber ? 'border-primary' : 'border-border'}`}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Basic</h3>
              {!isPaidSubscriber && (
                <span className="rounded-sm bg-secondary px-2 py-1 text-xs font-medium">Current plan</span>
              )}
            </div>
            <p className="text-muted-foreground mt-2">Basic access to government data.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-[hsl(var(--trust))]" />
                Browse official public records
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-[hsl(var(--trust))]" />
                {AI_FREE_USAGE_LIMIT} free GovSource Assistant uses per month
              </li>
            </ul>
          </div>
          {/* Pro Tier */}
          <div className={`rounded-lg border p-6 ${isPaidSubscriber ? 'border-primary' : 'border-border'}`}>
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold">Pro</h3>
              <div className="text-right">
                {!isPaidSubscriber && (
                  <p className="text-2xl font-bold text-primary">$1.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                )}
                {isPaidSubscriber && (
                  <span className="rounded-sm bg-secondary px-2 py-1 text-xs font-medium">Current plan</span>
                )}
              </div>
            </div>
            <p className="text-muted-foreground mt-2">Unlimited GovSource Assistant, personalized alerts, and more.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-[hsl(var(--trust))]" />
                All Basic features
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-[hsl(var(--trust))]" />
                Unlimited GovSource Assistant usage
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-[hsl(var(--trust))]" />
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

              </div>
            </details>
          </section>
        </div>
      )}
      {activeSection === 'watching' && <section aria-labelledby="watching-heading">
        <h2 id="watching-heading" className="font-serif text-2xl">Watching</h2>
        <p className="mt-2 text-sm text-muted-foreground">The records, people, and agencies you’ve saved for reference.</p>
        {isLoading ? <div className="flex justify-center py-16"><LoadingIndicator size="large" /></div> : savedError ? (
          <div role="alert" className="mt-6 border-y border-border py-8">
            <p className="text-sm text-muted-foreground">{savedError}</p>
            <Button variant="outline" className="mt-4" onClick={() => setRetry(value => value + 1)}>Try again</Button>
          </div>
        ) : <>
        <div aria-label="Filter watched items" className="mb-6 mt-5 flex flex-wrap gap-2">
          {categories.map(item => <Button key={item.id} variant="ghost" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`h-9 gap-2 rounded-md border px-3 text-xs ${category === item.id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{item.label}<span className="tabular-nums opacity-70">{item.count}</span></Button>)}
        </div>
      <div hidden={category !== 'bills'} className="mb-8">
        <h3 className="sr-only">Bills watched</h3>
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
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Unsave this bill"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven&apos;t saved any bills yet.</p>
            <Link href="/bills" className="text-sm font-semibold text-primary hover:underline">
              Browse bills
            </Link>
          </div>
        )}
      </div>

      <div hidden={category !== 'congress'} className="mb-8">
        <h3 className="sr-only">Congress members watched</h3>
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
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Unsave this Congress member"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven&apos;t saved any congress members yet.</p>
            <Link href="/congress-members" className="text-sm font-semibold text-primary hover:underline">
              Browse Congress members
            </Link>
          </div>
        )}
      </div>

      <div hidden={category !== 'agencies'} className="mb-8">
        <h3 className="sr-only">Agencies watched</h3>
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
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Unsave this agency"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven&apos;t saved any agencies yet.</p>
            <Link href="/agencies" className="text-sm font-semibold text-primary hover:underline">
              Browse agencies
            </Link>
          </div>
        )}
      </div>

      <div hidden={category !== 'judges'} className="mb-8">
        <h3 className="sr-only">Judges watched</h3>
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
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Unsave this judge"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven&apos;t saved any judges yet.</p>
            <Link href="/judges" className="text-sm font-semibold text-primary hover:underline">
              Browse judges
            </Link>
          </div>
        )}
      </div>

      <div hidden={category !== 'cases'} className="mb-8">
        <h3 className="sr-only">Court cases watched</h3>
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
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Unsave this court case"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven&apos;t saved any court cases yet.</p>
            <Link href="/supreme-court-cases" className="text-sm font-semibold text-primary hover:underline">
              Browse court cases
            </Link>
          </div>
        )}
      </div>

      <div hidden={category !== 'rules'} className="mb-8">
        <h3 className="sr-only">Agency rules watched</h3>
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
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Unsave this document"
                >
                  <BookmarkMinus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-y border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven&apos;t saved any agency rules yet.</p>
            <Link href="/agency-rules" className="text-sm font-semibold text-primary hover:underline">
              Browse agency rules
            </Link>
          </div>
        )}
      </div>
        </>}
      </section>}
    </div></div>
  );
}

export default function ProfilePage() {
  return <Suspense fallback={<div className="flex justify-center py-16"><LoadingIndicator size="large" /></div>}><ProfileContent /></Suspense>;
}
