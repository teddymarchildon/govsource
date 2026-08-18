import LoadingIndicator from '@/components/ui/LoadingIndicator';

export default function Loading() {
  return (
    <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4 py-12" aria-label="Loading page">
      <LoadingIndicator size="large" />
    </div>
  );
}

