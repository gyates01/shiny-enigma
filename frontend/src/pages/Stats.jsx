import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { getCategoryAccent, CUISINE_PALETTE } from '../lib/categoryUtils'

function fmtTime(mins) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function StatTile({ label, value, sub, accent }) {
  return (
    <div
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '16px 18px', overflow: 'hidden',
        transition: 'transform 0.15s, box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)'
        e.currentTarget.style.borderColor = 'var(--border2)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {accent && (
        <div style={{ height: 4, margin: '-16px -18px 14px', borderRadius: '12px 12px 0 0', background: accent }} />
      )}
      <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function BarRow({ label, count, max, color }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span style={{ color: 'var(--dim)', fontWeight: 500 }}>{count}</span>
      </div>
      <div style={{ height: 5, background: 'var(--card2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: color, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

function BreakdownSection({ title, rows, labelKey, countKey, getRowColor }) {
  if (!rows?.length) return null
  const max = rows[0]?.[countKey] ?? 1
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', marginBottom: 12, overflow: 'hidden',
    }}>
      <div style={{ height: 4, margin: '-16px -18px 14px', borderRadius: '12px 12px 0 0', background: 'var(--border)' }} />
      <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>{title}</h2>
      {rows.map((row, i) => (
        <BarRow key={row[labelKey]} label={row[labelKey]} count={row[countKey]} max={max} color={getRowColor(row, i)} />
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
           style={{ background: 'var(--card2)', border: '1px solid var(--border2)', color: 'var(--muted)', padding: '7px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13 }}>
          Export
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20, maxWidth: 600, margin: '0 auto 20px' }}>
        <StatTile label="Recipes"    value={stats.total}                                             accent="var(--accent)" />
        <StatTile label="Avg calories" value={stats.avg_calories ? `${stats.avg_calories}` : null}  sub="kcal" accent="#0ea5e9" />
        <StatTile label="Avg cook time" value={fmtTime(stats.avg_total_time_min)}                    accent="#f59e0b" />
        <StatTile label="Total cooks" value={stats.total_cooks || 0}                                 accent="var(--accent-light)" />
      </div>

      {stats.total_cooks > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '16px 18px', marginBottom: 12, maxWidth: 600, margin: '0 auto 12px', overflow: 'hidden',
        }}>
          <div style={{ height: 4, margin: '-16px -18px 14px', borderRadius: '12px 12px 0 0', background: 'var(--accent)' }} />
          <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Cook History</h2>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: 'var(--muted)' }}>Recipes made</span>
            <span style={{ color: 'var(--dim)' }}>{stats.made_count} of {stats.total}</span>
          </div>
          <div style={{ height: 5, background: 'var(--card2)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ height: '100%', width: `${madePct}%`, background: 'var(--accent)', borderRadius: 4 }} />
          </div>

          {stats.most_cooked_title && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--dim)' }}>Most cooked</span>
              <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{stats.most_cooked_title} <span style={{ color: 'var(--dim)' }}>({stats.most_cooked_count}×)</span></span>
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <BreakdownSection title="By Cuisine"  rows={stats.by_cuisine}  labelKey="cuisine"  countKey="cnt"
          getRowColor={(_, i) => CUISINE_PALETTE[i % CUISINE_PALETTE.length]} />
        <BreakdownSection title="By Category" rows={stats.by_category} labelKey="category" countKey="cnt"
          getRowColor={(row) => getCategoryAccent(row.category)} />
      </div>
    </div>
  )
}
