import { NextRequest, NextResponse } from 'next/server';
import { getPublishedBriefs } from '@/lib/repositories/briefs';

export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get('limit') || 24);
  const limit = Number.isFinite(requested) ? Math.min(48, Math.max(1, Math.trunc(requested))) : 24;
  try {
    return NextResponse.json({ briefs: await getPublishedBriefs(limit) });
  } catch (error) {
    console.error('[public-briefs] Failed to load Briefs', error);
    return NextResponse.json({ briefs: [] }, { status: 500 });
  }
}
