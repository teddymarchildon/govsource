'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCongressmanById, getCongressmanSponsoredBills, getCongressmanCosponsoredBills, getCongressmanTerms } from '../../../services/api';
import BillCard from '../../../components/BillCard';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { Bill, Congressman, CongressmanTerm } from '../../../types/types';
import SaveButton from '../../../components/SaveButton';
import LoadingIndicator from '@/components/ui/LoadingIndicator';

type TabType = 'bills' | 'terms' | 'statistics';

export default function CongressmanDetailPage() {
  const params = useParams()
  const congressmanId = params.id as string;
  const [congressman, setCongressman] = useState<Congressman | null>(null);
  const [sponsoredBills, setSponsoredBills] = useState<Bill[]>([]);
  const [cosponsoredBills, setCosponsoredBills] = useState<Bill[]>([]);
  const [terms, setTerms] = useState<CongressmanTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('bills');

  // Calculate statistics
  const calculateStatistics = () => {
    const sponsoredBecameLaw = sponsoredBills.filter(bill => bill.law_enacted_date).length;
    const cosponsoredBecameLaw = cosponsoredBills.filter(bill => bill.law_enacted_date).length;

    // Calculate cross-party collaboration
    // 1. Bills they sponsored with other-party cosponsors
    const sponsoredWithOtherParty = sponsoredBills.filter(bill => {
      const cosponsors = bill.cosponsors || [];
      return cosponsors.some((cosponsor: any) =>
        (cosponsor.congressman?.party || cosponsor.party)?.toLowerCase() !== congressman?.party.toLowerCase()
      );
    }).length;

    // 2. Bills they cosponsored where the sponsor was from the other party
    const cosponsoredOtherParty = cosponsoredBills.filter(bill => {
      const sponsor = bill.sponsor?.congressman;
      return sponsor && (sponsor?.party)?.toLowerCase() !== congressman?.party.toLowerCase();
    }).length;

    const totalCrossPartyBills = sponsoredWithOtherParty + cosponsoredOtherParty;
    const totalBills = sponsoredBills.length + cosponsoredBills.length;

    const crossPartyPercentage = totalBills > 0
      ? Math.round((totalCrossPartyBills / totalBills) * 100)
      : 0;

    // Calculate policy area statistics
    const policyAreaStats = [...sponsoredBills, ...cosponsoredBills].reduce((acc: any, bill) => {
      const area = bill.policy_area || 'Uncategorized';
      if (!acc[area]) {
        acc[area] = {
          total: 0,
          becameLaw: 0,
          crossParty: 0
        };
      }
      acc[area].total++;
      if (bill.law_enacted_date) acc[area].becameLaw++;

      // Check for cross-party collaboration
      const isCrossParty = (bill.sponsor?.congressman?.party || bill.sponsor?.congressman?.party)?.toLowerCase() !== congressman?.party.toLowerCase() ||
        (bill.cosponsors || []).some((cosponsor: any) =>
          (cosponsor.congressman?.party || cosponsor.party)?.toLowerCase() !== congressman?.party.toLowerCase()
        );
      if (isCrossParty) acc[area].crossParty++;

      return acc;
    }, {});

    // Calculate activity over time
    const activityByYear = [...sponsoredBills, ...cosponsoredBills].reduce((acc: any, bill) => {
      const year = new Date(bill.introduced_date || '').getFullYear();
      if (!acc[year]) {
        acc[year] = {
          total: 0,
          becameLaw: 0,
          sponsored: 0,
          cosponsored: 0
        };
      }
      acc[year].total++;
      if (bill.law_enacted_date) acc[year].becameLaw++;
      if (bill.sponsor?.congressman?.id === congressman?.id) {
        acc[year].sponsored++;
      } else {
        acc[year].cosponsored++;
      }
      return acc;
    }, {});

    // Calculate bipartisan collaboration depth
    const otherPartyCollaborators = [...sponsoredBills, ...cosponsoredBills].reduce((acc: any, bill) => {
      // Check sponsor
      if (bill.sponsor?.congressman && bill.sponsor.congressman.party?.toLowerCase() !== congressman?.party.toLowerCase()) {
        const sponsorId = bill.sponsor.congressman.id;
        const sponsorName = bill.sponsor.congressman.full_name;
        const sponsorParty = bill.sponsor.congressman.party;

        if (!acc[sponsorId]) {
          acc[sponsorId] = {
            name: sponsorName,
            party: sponsorParty,
            count: 0
          };
        }
        acc[sponsorId].count++;
      }

      // Check cosponsors
      (bill.cosponsors || []).forEach((cosponsor: any) => {
        if (cosponsor.congressman && cosponsor.congressman.party?.toLowerCase() !== congressman?.party.toLowerCase()) {
          const cosponsorId = cosponsor.congressman.id;
          const cosponsorName = cosponsor.congressman.name; // Changed from full_name to name
          const cosponsorParty = cosponsor.congressman.party;

          if (!acc[cosponsorId]) {
            acc[cosponsorId] = {
              name: cosponsorName,
              party: cosponsorParty,
              count: 0
            };
          }
          acc[cosponsorId].count++;
        }
      });

      return acc;
    }, {});

    const avgOtherPartyCollaborators = totalBills > 0
      ? (Object.keys(otherPartyCollaborators).length / totalBills).toFixed(1)
      : 0;

    // Sort collaborators by count for top collaborators list
    const topCollaborators = Object.entries(otherPartyCollaborators)
      .sort(([, a]: [string, any], [, b]: [string, any]) => b.count - a.count)
      .slice(0, 5)
      .reduce((acc: any, [id, data]: [string, any]) => {
        acc[id] = data;
        return acc;
      }, {});
    return {
      sponsoredBecameLaw,
      cosponsoredBecameLaw,
      sponsoredWithOtherParty,
      cosponsoredOtherParty,
      totalCrossPartyBills,
      crossPartyPercentage,
      totalBills,
      policyAreaStats,
      activityByYear,
      avgOtherPartyCollaborators,
      topCollaborators
    };
  };

  const stats = calculateStatistics();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const congressmanData = await getCongressmanById(congressmanId);
        const sponsoredData = await getCongressmanSponsoredBills(congressmanId);
        const cosponsoredData = await getCongressmanCosponsoredBills(congressmanId);
        const termsData = await getCongressmanTerms(congressmanId);

        setCongressman(congressmanData);
        setSponsoredBills(sponsoredData);
        setCosponsoredBills(cosponsoredData);
        setTerms(termsData);
      } catch (error) {
        console.error('Error fetching congressman data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [congressmanId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
        </div>
      </div>
    );
  }

  if (!congressman) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Congressman not found
        </div>
      </div>
    );
  }

  // Helper function to get party color
  const getPartyColor = (party: string) => {
    switch (party.toLowerCase()) {
      case 'democrat':
        return 'bg-secondary text-secondary-foreground';
      case 'republican':
        return 'bg-red-100 text-red-800';
      case 'independent':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format chamber and district info
  const getChamberInfo = () => {
    if (!congressman.chamber) return null;

    const isHouse = congressman.chamber.toLowerCase() === 'house';
    const isSenate = congressman.chamber.toLowerCase() === 'senate';

    if (isHouse) {
      return `U.S. Representative${congressman.district ? `, ${congressman.state}-${congressman.district}` : ''}`;
    } else if (isSenate) {
      return `U.S. Senator, ${congressman.state}`;
    }

    return congressman.chamber;
  };

  // Format term years
  const formatTermYears = (term: CongressmanTerm) => {
    const startYear = term.start_year;
    const endYear = term.end_year ? term.end_year : 'Present';
    return `${startYear} - ${endYear}`;
  };

  // Format term position
  const formatTermPosition = (term: CongressmanTerm) => {
    const isHouse = term.chamber.toLowerCase() === 'house';
    const isSenate = term.chamber.toLowerCase() === 'senate';

    if (isHouse) {
      return `U.S. Representative${term.district ? `, ${term.state}-${term.district}` : ''}`;
    } else if (isSenate) {
      return `U.S. Senator, ${term.state}`;
    }

    return term.chamber;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Congress Members', href: '/congressmen' },
          { label: congressman?.full_name || 'Loading...' }
        ]}
      />

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
        </div>
      ) : congressman ? (
        <div>
          <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{congressman.full_name}</h1>
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-sm md:text-base">
                <div className={`px-2 py-1 rounded-md inline-flex items-center ${getPartyColor(congressman.party)}`}>
                  {congressman.party}
                </div>
                <div>{getChamberInfo()}</div>
              </div>
            </div>
            <div className="mt-4 md:mt-0">
              <SaveButton itemId={congressman.id} itemType="congressman" />
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6 overflow-x-auto">
            <nav className="flex space-x-4 md:space-x-8 whitespace-nowrap" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('bills')}
                className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
                  activeTab === 'bills'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Bills
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeTab === 'bills'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-gray-100 text-gray-900'
                }`}>
                  {sponsoredBills.length + cosponsoredBills.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('terms')}
                className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
                  activeTab === 'terms'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Terms
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeTab === 'terms'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-gray-100 text-gray-900'
                }`}>
                  {terms.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('statistics')}
                className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
                  activeTab === 'statistics'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Statistics
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mb-8">
            {activeTab === 'bills' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-semibold mb-4">Sponsored Bills ({sponsoredBills.length})</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {sponsoredBills.map(bill => (
                      <BillCard key={bill.id} bill={bill} />
                    ))}
                    {sponsoredBills.length === 0 && (
                      <p>No sponsored bills found.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4">Cosponsored Bills ({cosponsoredBills.length})</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {cosponsoredBills.map(bill => (
                      <BillCard key={bill.id} bill={bill} />
                    ))}
                    {cosponsoredBills.length === 0 && (
                      <p>No cosponsored bills found.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'terms' && (
              <div className="bg-white rounded-lg shadow p-4 md:p-6">
                <h2 className="text-xl font-semibold mb-4">Congressional Terms</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Congress
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Years
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Position
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {terms.map((term, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {term.congress}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {formatTermYears(term)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {formatTermPosition(term)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'statistics' && stats && (
              <div className="space-y-8">
                {/* Summary Statistics */}
                <div className="bg-white rounded-lg shadow p-4 md:p-6">
                  <h3 className="text-xl font-semibold mb-4">Summary</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Total Bills</div>
                      <div className="text-2xl font-bold">{stats.totalBills}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Sponsored</div>
                      <div className="text-2xl font-bold">{sponsoredBills.length}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Cosponsored</div>
                      <div className="text-2xl font-bold">{cosponsoredBills.length}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Became Law</div>
                      <div className="text-2xl font-bold">{(stats.sponsoredBecameLaw + stats.cosponsoredBecameLaw)}</div>
                      <div className="text-xs text-gray-500">
                        {stats.totalBills > 0 ? Math.round(((stats.sponsoredBecameLaw + stats.cosponsoredBecameLaw) / stats.totalBills) * 100) : 0}% success rate
                      </div>
                    </div>
                  </div>
                </div>

                {/* Policy Area Breakdown */}
                <div className="bg-gray-50 rounded-lg p-4 md:p-6">
                  <h3 className="text-xl font-semibold mb-4">Policy Area Breakdown</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(stats.policyAreaStats)
                      .sort(([, dataA]: [string, any], [, dataB]: [string, any]) => dataB.total - dataA.total)
                      .slice(0, 6)
                      .map(([area, data]: [string, any]) => (
                        <div key={area} className="bg-white rounded-lg p-4 shadow-sm">
                          <div className="font-medium mb-2">{area}</div>
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-sm">
                                <span>Total Bills</span>
                                <span className="font-medium">{data.total}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full"
                                  style={{ width: `${(data.total / stats.totalBills) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-sm">
                                <span>Became Law</span>
                                <span className="font-medium">{data.becameLaw}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{ width: `${(data.becameLaw / data.total) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-sm">
                                <span>Cross-Party</span>
                                <span className="font-medium">{data.crossParty}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-purple-600 h-2 rounded-full"
                                  style={{ width: `${(data.crossParty / data.total) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Legislative Activity Over Time Section */}
                <div className="bg-gray-50 rounded-lg p-4 md:p-6">
                  <h3 className="text-xl font-semibold mb-4">Legislative Activity Over Time</h3>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 text-xs">Year</th>
                            <th className="text-right py-2 text-xs">Total Bills</th>
                            <th className="text-right py-2 text-xs">Sponsored</th>
                            <th className="text-right py-2 text-xs">Cosponsored</th>
                            <th className="text-right py-2 text-xs">Became Law</th>
                            <th className="text-right py-2 text-xs">Success Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(stats.activityByYear)
                            .sort(([yearA], [yearB]) => parseInt(yearB) - parseInt(yearA))
                            .map(([year, data]: [string, any]) => (
                              <tr key={year} className="border-b">
                                <td className="py-2 text-sm">{year}</td>
                                <td className="text-right py-2 text-sm">{data.total}</td>
                                <td className="text-right py-2 text-sm">{data.sponsored}</td>
                                <td className="text-right py-2 text-sm">{data.cosponsored}</td>
                                <td className="text-right py-2 text-sm">{data.becameLaw}</td>
                                <td className="text-right py-2 text-sm">
                                  {Math.round((data.becameLaw / data.total) * 100)}%
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Congressman not found
        </div>
      )}
    </div>
  );
}
