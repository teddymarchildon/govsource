import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { Brief } from '@/types/brief';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BriefTeaser from '@/components/briefs/BriefTeaser';
import BriefArticle from '@/components/briefs/BriefArticle';
import { briefInstitution } from '@/utils/briefSelection';
import { getPublishedBriefBySlug, getPublishedBriefsBySection } from '@/lib/repositories/briefs';

export const dynamic = 'force-dynamic';

type BriefPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BriefPageProps): Promise<Metadata> {
  const { slug } = await params;
  const brief = await getPublishedBriefBySlug(slug);
  if (!brief) return { title: 'Brief not found' };
  return { title: brief.title, description: brief.dek || brief.points[0]?.text.slice(0, 160) };
}

async function MoreBriefs({ brief }: { brief: Brief }) {
  let nextBriefs: Brief[];
  try {
    nextBriefs = (await getPublishedBriefsBySection(briefInstitution(brief), 4)).filter((item) => item.id !== brief.id).slice(0, 3);
  } catch (error) {
    console.error('[brief-recommendations] Failed to load more Briefs', error);
    return null;
  }
  return (
      nextBriefs.length ? <section className="mt-10 border-t-2 border-foreground pt-4" aria-label="More Briefs">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 className="font-serif text-2xl">Keep reading</h2><Link href="/briefs" className="text-sm font-semibold text-primary hover:underline">All Briefs →</Link></div>
        <div className="grid gap-6 md:grid-cols-3">{nextBriefs.map((next) => <BriefTeaser key={next.id} brief={next} placement="article:keep-reading" />)}</div>
      </section> : null
  );
}

export default async function BriefPage({ params }: BriefPageProps) {
  const { slug } = await params;
  const brief = await getPublishedBriefBySlug(slug);
  if (!brief) notFound();

  return (
    <BriefArticle brief={brief}>
      <Suspense fallback={null}><MoreBriefs brief={brief} /></Suspense>
    </BriefArticle>
  );
}
