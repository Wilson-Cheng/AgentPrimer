import { NextRequest, NextResponse } from 'next/server';
import { getDailyTokenStats, getTotalTokenStats } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/statistics?days=30
 *
 * Returns token usage statistics aggregated by day.
 * Query params:
 *   days – number of calendar days to look back (default: 30)
 */
export async function GET(request: NextRequest) {
  const days = Math.min(365, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10) || 30));

  const daily = getDailyTokenStats(days);

  // Summary totals for last 1 / 7 / 30 days
  const last1d  = getTotalTokenStats(1);
  const last7d  = getTotalTokenStats(7);
  const last30d = getTotalTokenStats(30);

  return NextResponse.json({ daily, summary: { last1d, last7d, last30d } });
}
