import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

interface SpendingSummary {
  totals: { overall: number; by_category: Record<string, number> };
  monthly: Array<{ month: string; total: number; by_category: Record<string, number> }>;
  categories: string[];
}

export default function SpendingDashboard({ userId, months = 6 }: { userId: string; months?: number }) {
  const [data, setData] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/spending-summary?user_id=${encodeURIComponent(userId)}&months=${months}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load summary');
        return r.json();
      })
      .then((json) => {
        setData(json as SpendingSummary);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [userId, months]);

  if (!userId) return <div>Please sign in to view the dashboard.</div>;
  if (loading) return <div>Loading dashboard...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!data) return <div>No spending data available.</div>;

  // Prepare line chart data (monthly totals)
  const lineData = data.monthly.map((m) => ({ month: m.month, total: m.total }));

  // Prepare stacked bar data for categories per month
  const categories = data.categories && data.categories.length > 0 ? data.categories : Object.keys(data.totals.by_category || {});
  const barData = data.monthly.map((m) => {
    const base: any = { month: m.month, total: m.total };
    categories.forEach((c) => { base[c] = m.by_category[c] || 0; });
    return base;
  });

  const topCategories = Object.entries(data.totals.by_category || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div style={{ padding: 16 }}>
      <h3>Spending Dashboard</h3>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Total Spent</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>${data.totals.overall.toFixed(2)}</div>
        </div>
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Top Categories</div>
          <div>
            {topCategories.map(([cat, val]) => (
              <div key={cat} style={{ fontSize: 14 }}>{cat}: ${Number(val).toFixed(2)}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 240, marginBottom: 20 }}>
        <ResponsiveContainer>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#0070f3" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            {categories.map((c, idx) => (
              <Bar key={c} dataKey={c} stackId="a" fill={["#8884d8", "#82ca9d", "#ffc658", "#ff7f7f", "#8dd1e1"][idx % 5]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
