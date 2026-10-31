import BriefsAdminPage from './BriefsAdminPage';
import type { BriefStatus } from '@/types/brief';
import type { ContentType } from '@/types/content';
import { isContentType } from '@/utils/contentReferences';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminBriefsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const type = first(params.primaryItemType);
  const id = first(params.primaryItemId);
  const title = first(params.title);

  const initialSource = type && isContentType(type) && id && /^\d+$/.test(id)
    ? { type: type as ContentType, id, title: title || '' }
    : null;

  const status = first(params.status);
  const initialStatus = status && ['all', 'review', 'draft', 'published', 'scheduled', 'archived'].includes(status) ? status as BriefStatus | 'all' : 'review';
  return <BriefsAdminPage initialSource={initialSource} initialStatus={initialStatus} initialWorkspace={first(params.view) === 'generate' ? 'generate' : 'review'} />;
}
