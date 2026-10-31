'use client';

import { usePathname } from 'next/navigation';

const destinations = [
  ['/admin', 'Overview'],
  ['/admin/briefs', 'Briefs'],
  ['/admin/front-pages', 'Front pages'],
  ['/admin/pipeline', 'Pipeline & limits'],
];

export default function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Admin navigation" className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 border-b border-border px-4 py-3">
    <span className="mr-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Editorial desk</span>
    {destinations.map(([href, label]) => {
      const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
      // Full navigation preserves the editors' existing beforeunload protection.
      return <a key={href} href={href} aria-current={active ? 'page' : undefined} className={`rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{label}</a>;
    })}
  </nav>;
}
