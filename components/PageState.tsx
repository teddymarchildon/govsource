import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertCircle, ArrowLeft } from 'lucide-react';

type PageStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function PageState({ title, description, action }: PageStateProps) {
  return (
    <div className="container mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <AlertCircle className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-center">
          {action || (
            <Link href="/" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to GovSource
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

