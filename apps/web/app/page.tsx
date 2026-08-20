import HomeClient from './HomeClient';
import { getHomepagePublicData } from '@/lib/repositories/homepage';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const publicData = await getHomepagePublicData();
  return <HomeClient {...publicData} />;
}
