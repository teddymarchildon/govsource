import { NextResponse } from 'next/server';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

// Reports only the current session's status; never accepts another user's ID.
export async function GET() {
  try {
    const { user, isAdmin } = await getCurrentUserAndAdminStatus();
    return NextResponse.json({ userId: user?.id ?? null, isAdmin: Boolean(user && isAdmin) }, { headers });
  } catch {
    return NextResponse.json({ userId: null, isAdmin: false }, { status: 503, headers });
  }
}
