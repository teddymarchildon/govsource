import { NextRequest, NextResponse } from 'next/server';

import { getPublishedArticles } from '@/lib/repositories/articles';

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 40)
    : 20;

  try {
    const articles = await getPublishedArticles(limit);
    return NextResponse.json({ articles });
  } catch (error) {
    console.error('[public-articles] Failed to load published articles', error);
    return NextResponse.json({ articles: [] }, { status: 500 });
  }
}
