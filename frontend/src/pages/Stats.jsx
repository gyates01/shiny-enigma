import { useState, useEffect } from 'react'
import { api } from '../lib/api'

function fmtTime(mins) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1e1e1e' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value ?? '—'}</span>
    </div>
  )
}

function BreakdownTable({ title, rows, labelKey, countKey }) {
  if (!rows?.length) return null
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      {rows.map(row => (
        <div key={row[labelKey]} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '8px 0', borderBottom: '1px solid #1a1a1a', fontSize: 14,
        }}>
          <span>{row[labelKey]}</span>
          <span style={{ color: '#888' }}>{row[countKey]}</span>
        </div>
      ))}
    </div>
  )
}

export default function Stats() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getStats().then(setStats).catch(e => setError(e.message))
  }, [])

  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!stats) return <div className="page"><p className="dim">Loading...</p></div>

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Stats</h1>
        <a href={api.exportUrl()} download
           style={{ background: '#2a2a2a', color: '#ccc', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
          Export Excel
        </a>
      </div>

      <StatRow label="Total recipes" value={stats.total} />
      <StatRow label="Avg calories" value={stats.avg_calories ? `${stats.avg_calories} kcal` : null} />
      <StatRow label="Avg cook time" value={fmtTime(stats.avg_total_time_min)} />

      <BreakdownTable title="By Cuisine" rows={stats.by_cuisine} labelKey="cuisine" countKey="cnt" />
      <BreakdownTable title="By Category" rows={stats.by_category} labelKey="category" countKey="cnt" />
    </div>
  )
}
