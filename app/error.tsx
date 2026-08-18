'use client';

import PageState from '@/components/PageState';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageState
      title="We couldn't load this page"
      description="The source data may be temporarily unavailable. You can retry without losing your place."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

