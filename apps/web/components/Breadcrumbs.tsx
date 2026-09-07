import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const collections = {
  bills: { label: 'Bills', href: '/bills' },
  laws: { label: 'Laws', href: '/laws' },
  executiveOrders: { label: 'Executive Orders', href: '/executive-orders' },
  agencyDocuments: { label: 'Agency Documents', href: '/agency-rules' },
  courtCases: { label: 'Supreme Court Cases', href: '/supreme-court-cases' },
  congressMembers: { label: 'Congress Members', href: '/congress-members' },
  agencies: { label: 'Federal Agencies', href: '/agencies' },
  justices: { label: 'Supreme Court Justices', href: '/judges' },
} as const;

const linkClassName = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function ParentNavigationLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={linkClassName}>
      <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {children}
    </Link>
  );
}

export default function Breadcrumbs({ collection, currentLabel, className = '' }: {
  collection: keyof typeof collections;
  currentLabel: string;
  className?: string;
}) {
  const parent = collections[collection];

  return (
    <nav className={`min-w-0 text-sm ${className}`} aria-label="Breadcrumb">
      <div className="md:hidden">
        <ParentNavigationLink href={parent.href}>{parent.label}</ParentNavigationLink>
      </div>
      <ol className="hidden min-h-[44px] min-w-0 items-center gap-2 md:flex">
        <li className="shrink-0"><Link href="/" className={linkClassName}>Home</Link></li>
        <li className="flex shrink-0 items-center gap-2">
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          <Link href={parent.href} className={linkClassName}>{parent.label}</Link>
        </li>
        <li className="flex min-w-0 items-center gap-2">
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span aria-current="page" className="truncate font-medium text-foreground" title={currentLabel}>{currentLabel}</span>
        </li>
      </ol>
    </nav>
  );
}
