import { useState, useEffect } from 'react'
import { api } from '../lib/api'

function fmtTime(mins) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function StatTile({ label, value, sub }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#f3f4f6', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function BarRow({ label, count, max, color }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: '#d1d5db' }}>{label}</span>
        <span style={{ color: '#6b7280', fontWeight: 500 }}>{count}</span>
      </div>
      <div style={{ height: 5, background: '#1f2937', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: color, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

function BreakdownSection({ title, rows, labelKey, countKey, color }) {
  if (!rows?.length) return null
  const max = rows[0]?.[countKey] ?? 1
  return (
    <div style={{
      background: '#111827', border: '1px solid #1f2937', borderRadius: 12,
      padding: '16px 18px', marginBottom: 12,
    }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>{title}</h2>
      {rows.map(row => (
        <BarRow key={row[labelKey]} label={row[labelKey]} count={row[countKey]} max={max} color={color} />
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

  const madePct = stats.total > 0 ? Math.round((stats.made_count / stats.total) * 100) : 0

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, maxWidth: 600, margin: '0 auto 20px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Stats</h1>
        <a href={api.exportUrl()} download
           style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af', padding: '7px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13 }}>
          Export
        </a>
      </div>

      {/* Top stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20, maxWidth: 600, margin: '0 auto 20px' }}>
        <StatTile label="Recipes" value={stats.total} />
        <StatTile label="Avg calories" value={stats.avg_calories ? `${stats.avg_calories}` : null} sub="kcal" />
        <StatTile label="Avg cook time" value={fmtTime(stats.avg_total_time_min)} />
        <StatTile label="Total cooks" value={stats.total_cooks || 0} />
      </div>

      {/* Cook history card */}
      {stats.total_cooks > 0 && (
        <div style={{
          background: '#111827', border: '1px solid #1f2937', borderRadius: 12,
          padding: '16px 18px', marginBottom: 12, maxWidth: 600, margin: '0 auto 12px',
        }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Cook History</h2>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: '#d1d5db' }}>Recipes made</span>
            <span style={{ color: '#6b7280' }}>{stats.made_count} of {stats.total}</span>
          </div>
          <div style={{ height: 5, background: '#1f2937', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ height: '100%', width: `${madePct}%`, background: '#7c6af7', borderRadius: 4 }} />
          </div>

          {stats.most_cooked_title && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>Most cooked</span>
              <span style={{ color: '#d1d5db', fontWeight: 500 }}>{stats.most_cooked_title} <span style={{ color: '#6b7280' }}>({stats.most_cooked_count}×)</span></span>
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <BreakdownSection title="By Cuisine"  rows={stats.by_cuisine}  labelKey="cuisine"  countKey="cnt" color="#7c6af7" />
        <BreakdownSection title="By Category" rows={stats.by_category} labelKey="category" countKey="cnt" color="#2dd4bf" />
      </div>
    </div>
  )
}
