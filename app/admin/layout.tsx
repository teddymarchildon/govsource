import { redirect } from 'next/navigation';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();

  if (!user) {
    redirect('/login?redirect=%2Fadmin');
  }

  if (!isAdmin) {
    redirect('/');
  }

  return <>{children}</>;
}
