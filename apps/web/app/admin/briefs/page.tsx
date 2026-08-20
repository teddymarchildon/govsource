import BriefsAdminPage from './BriefsAdminPage';
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

  return <BriefsAdminPage initialSource={initialSource} />;
}
