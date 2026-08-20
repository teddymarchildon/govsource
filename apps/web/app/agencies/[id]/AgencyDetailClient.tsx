'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Agency, AgencyDocument } from '../../../types/types';
import AgencyCard from '../../../components/AgencyCard';
import SaveButton from '../../../components/SaveButton';
import AgencyDocuments from '../../../components/AgencyDocuments';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type AgencyDetailClientProps = {
  agencyId: string;
  agency: Agency;
  childAgencies: Agency[];
  documents: AgencyDocument[];
};

export default function AgencyDetailClient({ agencyId, agency, childAgencies, documents }: AgencyDetailClientProps) {
  const [activeTab, setActiveTab] = useState<'subagencies' | 'rules'>('subagencies');

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Federal Agencies', href: '/agencies' },
          { label: agency.name }
        ]}
      />

      {/* Agency Header (match CongressmanDetailPage style) */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{agency.name}
            {agency.short_name && (
              <span className="ml-2 text-lg text-gray-500">({agency.short_name})</span>
            )}
          </h1>
          {agency.parent && (
            <div className="text-gray-600 text-sm mb-1">
              <span className="font-medium">Part of:</span>{' '}
              <Link href={`/agencies/${agency.parent.id}`} className="text-primary hover:underline">
                {agency.parent.name}
              </Link>
            </div>
          )}
        </div>
        <div className="mt-4 md:mt-0">
          <SaveButton itemId={agencyId} itemType="agency" />
        </div>
      </div>

      {/* Agency Description (separate section) */}
      <div className="mb-8">
        {agency.description ? (
          <p className="text-gray-700 whitespace-pre-line">{agency.description}</p>
        ) : (
          <p className="text-gray-500 italic">No description available for this agency.</p>
        )}
      </div>

      {/* Tab Navigation (moved out of Card, styled like CongressmanDetailPage) */}
      <div className="border-b border-border/60 mb-6 overflow-x-auto">
        <nav className="flex gap-2 whitespace-nowrap pb-1" aria-label="Tabs">
          <Button
            variant="ghost"
            onClick={() => setActiveTab('subagencies')}
            className={`inline-flex items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm md:text-base font-normal transition-colors duration-200 ${
              activeTab === 'subagencies'
                ? 'rounded-md bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            Sub-Agencies
            <Badge variant={activeTab === 'subagencies' ? 'secondary' : 'outline'} className="ml-2">
              {childAgencies.length}
            </Badge>
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('rules')}
            className={`inline-flex items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm md:text-base font-normal transition-colors duration-200 ${
              activeTab === 'rules'
                ? 'rounded-md bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            Rules
            <Badge variant={activeTab === 'rules' ? 'secondary' : 'outline'} className="ml-2">
              {documents.length}
            </Badge>
          </Button>
        </nav>
      </div>

      {/* Tab Content (inside Card) */}
      <Card className="bg-white shadow rounded-lg overflow-hidden">
        <CardContent className="p-6">
          {activeTab === 'subagencies' && (
            <div>
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-xl font-semibold text-gray-900">Sub-Agencies</CardTitle>
              </CardHeader>
              {childAgencies.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {childAgencies.map((childAgency) => (
                    <AgencyCard key={childAgency.id} agency={childAgency} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No sub-agencies</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    This agency does not have any sub-agencies.
                  </p>
                </div>
              )}
            </div>
          )}
          {activeTab === 'rules' && (
            <div>
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-xl font-semibold text-gray-900">Rules</CardTitle>
              </CardHeader>
              <AgencyDocuments documents={documents} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
