import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';

interface SpendingSummary {
  totals: { overall: number; by_category: Record<string, number> };
  monthly: Array<{ month: string; total: number; by_category: Record<string, number> }>;
  categories: string[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Beverage': '#f97316',
  'Groceries':       '#22c55e',
  'Transport':       '#3b82f6',
  'Healthcare':      '#ec4899',
  'Entertainment':   '#a855f7',
  'Utilities':       '#14b8a6',
  'Shopping':        '#eab308',
  'Education':       '#06b6d4',
  'Personal Care':   '#f43f5e',
  'Other':           '#94a3b8',
};

const FALLBACK_COLORS = ['#f97316','#22c55e','#3b82f6','#ec4899','#a855f7','#14b8a6','#eab308','#06b6d4'];

function getColor(cat: string, idx: number) {
  return CATEGORY_COLORS[cat] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
      color: '#f1f5f9',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#94a3b8' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: p.fill || p.stroke }}>{p.dataKey === 'total' ? 'Total' : p.dataKey}</span>
          <span style={{ fontWeight: 600 }}>${Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export default function SpendingDashboard({ userId, months = 6 }: { userId: string; months?: number }) {
  const [data, setData] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'breakdown'>('overview');

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/spending-summary?user_id=${encodeURIComponent(userId)}&months=${months}`)
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(`Failed to load summary (${r.status}): ${text}`);
        try {
          setData(JSON.parse(text) as SpendingSummary);
        } catch {
          throw new Error('Summary response was not valid JSON.');
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [userId, months]);

  if (!userId) return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>👤</div>
      <p style={{ color: '#64748b' }}>Sign in to view your spending dashboard.</p>
    </div>
  );

  if (loading) return (
    <div style={styles.emptyState}>
      <div style={styles.spinner} />
      <p style={{ color: '#64748b', marginTop: 12 }}>Loading your spending data…</p>
    </div>
  );

  if (error) return (
    <div style={{ ...styles.emptyState, gap: 8 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <p style={{ color: '#ef4444', fontWeight: 600 }}>Something went wrong</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>{error}</p>
    </div>
  );

  if (!data || data.monthly.length === 0) return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>🧾</div>
      <p style={{ color: '#64748b', fontWeight: 600 }}>No receipts yet</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>Upload your first receipt to see spending insights here.</p>
    </div>
  );

  const categories = data.categories?.length > 0
    ? data.categories
    : Object.keys(data.totals.by_category || {});

  const lineData = data.monthly.map((m) => ({ month: m.month, total: m.total }));

  const barData = data.monthly.map((m) => {
    const base: any = { month: m.month };
    categories.forEach((c) => { base[c] = m.by_category[c] || 0; });
    return base;
  });

  const pieData = Object.entries(data.totals.by_category || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const topCategories = pieData.slice(0, 5);

  const avgMonthly = data.monthly.length > 0
    ? data.totals.overall / data.monthly.length
    : 0;

  const lastMonth = data.monthly[data.monthly.length - 1];
  const prevMonth = data.monthly[data.monthly.length - 2];
  const monthDelta = lastMonth && prevMonth
    ? ((lastMonth.total - prevMonth.total) / prevMonth.total) * 100
    : null;

  return (
    <div style={styles.container}>
      {/* Stat Cards */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total Spent</div>
          <div style={styles.statValue}>${data.totals.overall.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>All time</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Avg / Month</div>
          <div style={styles.statValue}>${avgMonthly.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Last {months} months</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>This Month</div>
          <div style={styles.statValue}>
            {lastMonth ? `$${lastMonth.total.toFixed(2)}` : '—'}
          </div>
          {monthDelta !== null && (
            <div style={{
              fontSize: 12,
              marginTop: 4,
              color: monthDelta > 0 ? '#ef4444' : '#22c55e',
              fontWeight: 600
            }}>
              {monthDelta > 0 ? '▲' : '▼'} {Math.abs(monthDelta).toFixed(1)}% vs last month
            </div>
          )}
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Top Category</div>
          <div style={{ ...styles.statValue, fontSize: 16 }}>
            {topCategories[0]?.name ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {topCategories[0] ? `$${topCategories[0].value.toFixed(2)}` : ''}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={styles.tabBar}>
        {(['overview', 'categories', 'breakdown'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {})
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview: Area chart */}
      {activeTab === 'overview' && (
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Monthly Spending Trend</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#totalGrad)" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Categories: Pie + legend */}
      {activeTab === 'categories' && (
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Spending by Category</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ height: 240, flex: '0 0 220px' }}>
              <ResponsiveContainer width={220} height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={entry.name} fill={getColor(entry.name, idx)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              {pieData.map((entry, idx) => (
                <div key={entry.name} style={styles.legendRow}>
                  <div style={{ ...styles.legendDot, background: getColor(entry.name, idx) }} />
                  <span style={{ flex: 1, color: '#cbd5e1', fontSize: 13 }}>{entry.name}</span>
                  <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>${entry.value.toFixed(2)}</span>
                  <span style={{ color: '#64748b', fontSize: 12, minWidth: 38, textAlign: 'right' }}>
                    {data.totals.overall > 0 ? ((entry.value / data.totals.overall) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown: stacked bar */}
      {activeTab === 'breakdown' && (
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Monthly Breakdown by Category</div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 12 }} />
                {categories.map((c, idx) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={getColor(c, idx)} radius={idx === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: '#f1f5f9',
    padding: '4px 0 24px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '14px 16px',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#475569',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f1f5f9',
    lineHeight: 1.1,
  },
  tabBar: {
    display: 'flex',
    gap: 4,
    background: '#0f172a',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    border: '1px solid #1e293b',
  },
  tab: {
    flex: 1,
    padding: '7px 12px',
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: '#1e293b',
    color: '#f1f5f9',
  },
  chartCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '20px 16px',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 16,
    letterSpacing: '0.02em',
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 0',
    borderBottom: '1px solid #1e293b',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center' as const,
    gap: 4,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #1e293b',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};