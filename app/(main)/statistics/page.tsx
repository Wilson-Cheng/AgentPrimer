'use client';

/**
 * app/statistics/page.tsx
 * ---------------------------------------------------------------------------
 * Token usage statistics page.
 *
 * Shows input (broken down as cached vs non-cached) and output token usage
 * over time with selectable day/week/month views, summary cards, and a
 * bar chart rendered with Recharts.
 */

import { useState, useEffect } from 'react';


import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart2, RefreshCw, Coins, TrendingUp, ArrowDown, ArrowUp } from 'lucide-react';

interface DailyStats {
  day: string;
  input: number;
  cached: number;
  output: number;
}

interface Summary {
  input: number;
  cached: number;
  output: number;
}

interface StatsResponse {
  daily: DailyStats[];
  summary: {
    last1d: Summary;
    last7d: Summary;
    last30d: Summary;
  };
}

// ── View options ─────────────────────────────────────────────────────────────
const VIEWS: { label: string; days: number }[] = [
  { label: '7 Days',   days: 7   },
  { label: '30 Days',  days: 30  },
  { label: '90 Days',  days: 90  },
  { label: '1 Year',   days: 365 },
];

// ── Aggregation helpers ───────────────────────────────────────────────────────

/**
 * Aggregate daily rows into weekly buckets for the weekly view.
 * Each bucket is labeled with its start date (Monday).
 */
function groupByWeek(daily: DailyStats[]): DailyStats[] {
  const buckets: Record<string, DailyStats> = {};
  for (const row of daily) {
    const d = new Date(row.day + 'T00:00:00Z');
    // Align to Monday (ISO week start)
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    d.setUTCDate(d.getUTCDate() - dow);
    const key = d.toISOString().slice(0, 10);
    if (!buckets[key]) buckets[key] = { day: key, input: 0, cached: 0, output: 0 };
    buckets[key].input  += row.input;
    buckets[key].cached += row.cached;
    buckets[key].output += row.output;
  }
  return Object.values(buckets).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Aggregate daily rows into monthly buckets (YYYY-MM).
 */
function groupByMonth(daily: DailyStats[]): DailyStats[] {
  const buckets: Record<string, DailyStats> = {};
  for (const row of daily) {
    const key = row.day.slice(0, 7); // 'YYYY-MM'
    if (!buckets[key]) buckets[key] = { day: key + '-01', input: 0, cached: 0, output: 0 };
    buckets[key].input  += row.input;
    buckets[key].cached += row.cached;
    buckets[key].output += row.output;
  }
  return Object.values(buckets).sort((a, b) => a.day.localeCompare(b.day));
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const nonCached = payload.find(p => p.dataKey === 'nonCached');
  const cached    = payload.find(p => p.dataKey === 'cached');
  const output    = payload.find(p => p.dataKey === 'output');
  const totalInput = (nonCached?.value ?? 0) + (cached?.value ?? 0);
  const totalAll   = totalInput + (output?.value ?? 0);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-xl text-sm space-y-1.5 min-w-[180px]">
      <p className="font-700 text-gray-900 dark:text-gray-100 mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#3b82f6' }} />
            Input
          </span>
          <span className="font-mono text-gray-900 dark:text-gray-100">{totalInput.toLocaleString()}</span>
        </div>
        {(cached?.value ?? 0) > 0 && (
          <div className="flex items-center justify-between gap-4 pl-4">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#10b981' }} />
              ↳ Cached
            </span>
            <span className="font-mono text-gray-400">{(cached?.value ?? 0).toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#8b5cf6' }} />
            Output
          </span>
          <span className="font-mono text-gray-900 dark:text-gray-100">{(output?.value ?? 0).toLocaleString()}</span>
        </div>
      </div>
      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <span className="text-gray-500">Total</span>
        <span className="font-mono font-700 text-gray-900 dark:text-gray-100">{totalAll.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, usage, accentClass,
}: {
  label: string;
  usage: Summary;
  accentClass: string;
}) {
  const input  = usage.input  ?? 0;
  const cached = usage.cached ?? 0;
  const output = usage.output ?? 0;
  const total = input + output;
  const cacheRate = input > 0 ? Math.round((cached / input) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-600 text-gray-600 dark:text-gray-400">{label}</p>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${accentClass}`}>
          <Coins size={15} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-800 text-gray-900 dark:text-gray-100 font-mono">{total.toLocaleString()}</p>
      <div className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><ArrowUp size={14} className="text-blue-400" /> Input</span>
          <span className="font-mono">{input.toLocaleString()}</span>
        </div>
        {cached > 0 && (
          <div className="flex items-center justify-between pl-3">
            <span className="flex items-center gap-1 text-emerald-500">↳ Cached ({cacheRate}%)</span>
            <span className="font-mono text-emerald-500">{cached.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><ArrowDown size={14} className="text-violet-400" /> Output</span>
          <span className="font-mono">{output.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ── Granularity selector ──────────────────────────────────────────────────────

type Granularity = 'day' | 'week' | 'month';

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'day',   label: 'Daily'   },
  { key: 'week',  label: 'Weekly'  },
  { key: 'month', label: 'Monthly' },
];

// ── Format axis tick labels ───────────────────────────────────────────────────

function formatTick(day: string, granularity: Granularity): string {
  if (granularity === 'month') {
    // 'YYYY-MM-01' → 'Jan 25'
    const d = new Date(day + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  if (granularity === 'week') {
    // Show 'MM/DD'
    const d = new Date(day + 'T00:00:00Z');
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  // Daily – show 'MM/DD'
  const d = new Date(day + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [selectedDays, setSelectedDays] = useState(30);
  const [granularity, setGranularity] = useState<Granularity>('day');

  const fetchData = async (days: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/statistics?days=${days}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(selectedDays); }, [selectedDays]);

  // Prepare chart rows from daily data according to chosen granularity
  const chartRows = (() => {
    if (!data?.daily) return [];
    const raw = granularity === 'week'  ? groupByWeek(data.daily)
              : granularity === 'month' ? groupByMonth(data.daily)
              : data.daily;
    return raw.map(r => ({
      day:      r.day,
      label:    formatTick(r.day, granularity),
      nonCached: r.input - r.cached,  // blue bar – non-cached input
      cached:   r.cached,             // green bar – cached input (stacked)
      output:   r.output,             // purple bar
    }));
  })();

  const totalRows = chartRows.length;
  const hasAnyData = chartRows.some(r => r.nonCached + r.cached + r.output > 0);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
        {/* Page header — sticks at top */}
        <div className="flex-shrink-0 bg-indigo-500 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-white/10 rounded-full translate-y-1/2" />
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <BarChart2 size={24} className="text-white" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h1 className="text-3xl font-800 text-white tracking-tight truncate">Statistics</h1>
                <p className="text-indigo-200 text-sm truncate">Token usage analytics across all conversations</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable content — scrollbar at browser edge */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-6">
          {/* Summary cards */}
          {data && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SummaryCard label="Today"      usage={data.summary.last1d}  accentClass="bg-sky-500" />
              <SummaryCard label="Last 7 Days" usage={data.summary.last7d}  accentClass="bg-indigo-500" />
              <SummaryCard label="Last 30 Days" usage={data.summary.last30d} accentClass="bg-violet-500" />
            </div>
          )}

          {/* Chart controls */}
          <section className="rounded-xl px-0 pb-6 md:p-6 md:bg-gray-50 dark:md:bg-gray-800/50">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-500" />
                <h2 className="font-700 text-gray-900 dark:text-gray-100">Token Usage Over Time</h2>
              </div>

              <div className="flex items-center gap-3">
                {/* Granularity selector */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
                  {GRANULARITIES.map(g => (
                    <button
                      key={g.key}
                      onClick={() => setGranularity(g.key)}
                      className={`px-3 py-1.5 font-medium transition-colors ${
                        granularity === g.key
                          ? 'bg-indigo-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Days range selector */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
                  {VIEWS.map(v => (
                    <button
                      key={v.days}
                      onClick={() => setSelectedDays(v.days)}
                      className={`px-3 py-1.5 font-medium transition-colors ${
                        selectedDays === v.days
                          ? 'bg-indigo-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => fetchData(selectedDays)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-indigo-500 transition-colors"
                  title="Refresh"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
              </div>
            </div>

            {/* Bar chart */}
            {loading ? (
              <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading…
              </div>
            ) : !hasAnyData ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                <BarChart2 size={36} className="opacity-30" />
                <p className="text-sm">No token data yet for this period.</p>
                <p className="text-sm text-gray-400">Enable &ldquo;Show token usage in messages&rdquo; in Settings to start tracking.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={chartRows}
                  margin={{ top: 4, right: 4, left: 0, bottom: totalRows > 14 ? 40 : 4 }}
                  barCategoryGap={totalRows > 30 ? '10%' : '25%'}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    className="text-gray-500 dark:text-gray-400"
                    angle={totalRows > 14 ? -40 : 0}
                    textAnchor={totalRows > 14 ? 'end' : 'middle'}
                    interval={totalRows > 60 ? Math.floor(totalRows / 20) : 0}
                  />
                  <YAxis
                    tickFormatter={formatK}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    className="text-gray-500 dark:text-gray-400"
                    width={44}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) =>
                      value === 'nonCached' ? 'Input (non-cached)'
                      : value === 'cached'   ? 'Input (cached)'
                      :                        'Output'
                    }
                  />
                  {/* Input bars: non-cached (blue) stacked with cached (green) */}
                  <Bar dataKey="nonCached" stackId="input" fill="#3b82f6" radius={[0, 0, 0, 0]} name="nonCached" />
                  <Bar dataKey="cached"    stackId="input" fill="#10b981" radius={[3, 3, 0, 0]} name="cached"    />
                  {/* Output bar: separate (purple) */}
                  <Bar dataKey="output" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="output" />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Legend explanation */}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                Input – tokens sent to model (non-cached)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
                Input – served from context cache (free or discounted)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-violet-500" />
                Output – tokens generated by model
              </div>
            </div>
          </section>

          {/* Usage efficiency card (only if there's cache data) */}
          {data && (data.summary.last30d.cached > 0) && (
            <section className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 text-sm text-emerald-700 dark:text-emerald-300">
              <p className="font-700 mb-1">Cache efficiency (last 30 days)</p>
              <p>
                {data.summary.last30d.cached.toLocaleString()} of {data.summary.last30d.input.toLocaleString()} input tokens (
                {Math.round((data.summary.last30d.cached / data.summary.last30d.input) * 100)}%) were served from cache.
                Cached tokens are typically billed at a discount by most providers.
              </p>
            </section>
          )}

          {/* Raw daily table */}
          {data && hasAnyData && (
            <section className="rounded-xl px-0 pb-6 md:p-6 md:bg-gray-50 dark:md:bg-gray-800/50">
              <h2 className="font-700 text-gray-900 dark:text-gray-100 mb-4">Daily Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 text-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                      <th className="pb-2 pr-6 font-600">Date</th>
                      <th className="pb-2 pr-6 font-600 text-right">Input</th>
                      <th className="pb-2 pr-6 font-600 text-right">Cached</th>
                      <th className="pb-2 pr-6 font-600 text-right">Output</th>
                      <th className="pb-2 font-600 text-right">Total</th>
                    </tr>
                  </thead>
                </table>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm font-mono">
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {[...data.daily].reverse().map(row => (
                        <tr key={row.day} className="text-gray-700 dark:text-gray-300">
                          <td className="py-1.5 pr-6">{row.day}</td>
                          <td className="py-1.5 pr-6 text-right text-blue-600 dark:text-blue-400">{(row.input ?? 0).toLocaleString()}</td>
                          <td className="py-1.5 pr-6 text-right text-emerald-600 dark:text-emerald-400">{(row.cached ?? 0).toLocaleString()}</td>
                          <td className="py-1.5 pr-6 text-right text-violet-600 dark:text-violet-400">{(row.output ?? 0).toLocaleString()}</td>
                          <td className="py-1.5 text-right font-700">{((row.input ?? 0) + (row.output ?? 0)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
          </div>{/* end inner centered content */}
        </div>{/* end outer scroll container */}
      </main>
  );
}
