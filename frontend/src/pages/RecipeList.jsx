import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getCategoryAccent } from '../lib/categoryUtils'

function RecipeCard({ recipe, onClick }) {
  const cuisines = recipe.cuisine ? recipe.cuisine.split(',').map(s => s.trim()).filter(Boolean) : []
  const categories = recipe.category ? recipe.category.split(',').map(s => s.trim()).filter(Boolean) : []
  const meta = [
    recipe.total_time && `⏱ ${recipe.total_time} min`,
    recipe.calories && `🔥 ${Math.round(recipe.calories)} cal`,
  ].filter(Boolean)

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 12px 32px rgba(124,106,247,0.18)'
        e.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div style={{ height: 4, background: getCategoryAccent(categories[0]), flexShrink: 0 }} />
      {recipe.image_url ? (
        <div style={{ position: 'relative', height: 162, overflow: 'hidden' }}>
          <img src={recipe.image_url} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
            background: 'linear-gradient(to top, rgba(26,26,26,0.95), transparent)',
          }} />
          {cuisines.length > 0 && (
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {cuisines.map(t => (
                <span key={t} style={{
                  background: 'rgba(20,10,40,0.72)', backdropFilter: 'blur(6px)',
                  color: '#c4b8ff', border: '1px solid rgba(124,106,247,0.35)',
                  borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          position: 'relative', height: 75,
          background: 'linear-gradient(135deg, #1e1a3a 0%, #12121f 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}>
          🍽️
          {cuisines.length > 0 && (
            <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {cuisines.map(t => (
                <span key={t} style={{
                  background: 'rgba(20,10,40,0.72)', backdropFilter: 'blur(6px)',
                  color: '#c4b8ff', border: '1px solid rgba(124,106,247,0.35)',
                  borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3, color: 'var(--text)' }}>
          {recipe.title}
        </div>

        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map(t => {
              const accent = getCategoryAccent(t)
              return (
                <span key={t} style={{
                  background: `${accent}26`, color: accent,
                  border: `1px solid ${accent}40`,
                  borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 500,
                }}>{t}</span>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 'auto', flexWrap: 'wrap' }}>
          {meta.length > 0 && (
            <div style={{ display: 'flex', gap: 14, color: 'var(--text-dim)', fontSize: 13 }}>
              {meta.map(m => <span key={m}>{m}</span>)}
            </div>
          )}
          {recipe.cook_count > 0 && (
            <span style={{
              marginLeft: 'auto', background: 'rgba(124,106,247,0.12)',
              border: '1px solid rgba(124,106,247,0.25)', color: '#a78bfa',
              borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            }}>Made {recipe.cook_count}×</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RecipeList() {
  const [recipes, setRecipes] = useState([])
  const [allRecipes, setAllRecipes] = useState([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ cuisine: '', category: '', max_time: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Fetch all recipes once to populate dropdown options
  useEffect(() => {
    api.listRecipes('', {}).then(setAllRecipes).catch(() => {})
  }, [])

  const load = useCallback(async (q, f, signal) => {
    setLoading(true)
    try {
      const activeFilters = {
        ...(f.cuisine ? { cuisine: f.cuisine } : {}),
        ...(f.category ? { category: f.category } : {}),
        ...(f.max_time ? { max_time: Number(f.max_time) } : {}),
      }
      const data = await api.listRecipes(q || '', activeFilters, signal)
      setRecipes(data)
      setError('')
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => load(query, filters, controller.signal), query ? 300 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, filters, load])

  const setFilter = (k, v) => setFilters(prev => ({ ...prev, [k]: v }))
  const clearFilters = () => setFilters({ cuisine: '', category: '', max_time: '' })
  const hasFilters = filters.cuisine || filters.category || filters.max_time

  const cuisines = useMemo(() => [...new Set(allRecipes.map(r => r.cuisine).filter(Boolean))].sort(), [allRecipes])
  const categories = useMemo(() => [...new Set(allRecipes.map(r => r.category).filter(Boolean))].sort(), [allRecipes])

  const filterStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
    borderRadius: 10, padding: '9px 13px', fontSize: 14, cursor: 'pointer', flex: '1 1 130px',
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 17, letterSpacing: '-0.5px' }}>
        My Recipes
        {!loading && recipes.length > 0 && (
          <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-dim)', marginLeft: 12 }}>
            {recipes.length}
          </span>
        )}
      </h1>

      <input
        type="text"
        placeholder="🔍  Search by name, ingredient, cuisine..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 12, fontSize: 14, padding: '11px 14px' }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {['', 'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack'].map(cat => {
          const isActive = filters.category === cat
          const chipColorHex = cat ? getCategoryAccent(cat) : '#7c6af7'
          return (
            <button
              key={cat}
              onClick={() => setFilter('category', cat)}
              style={{
                padding: '5px 14px', borderRadius: 20,
                border: `1px solid ${isActive ? chipColorHex : 'var(--border)'}`,
                background: isActive ? `${chipColorHex}22` : 'transparent',
                color: isActive ? chipColorHex : 'var(--muted)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{cat || 'All'}</button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22, alignItems: 'center' }}>
        <select value={filters.cuisine} onChange={e => setFilter('cuisine', e.target.value)} style={filterStyle}>
          <option value="">All cuisines</option>
          {cuisines.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number" min="1" placeholder="Max time (min)"
          value={filters.max_time} onChange={e => setFilter('max_time', e.target.value)}
          style={{ ...filterStyle, maxWidth: 160 }}
        />
        {hasFilters && (
          <button onClick={clearFilters} style={{
            background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)',
            color: 'var(--accent)', cursor: 'pointer', fontSize: 13, borderRadius: 10,
            padding: '10px 14px', fontWeight: 500,
          }}>✕ Clear</button>
        )}
      </div>

      {loading && <p className="dim" style={{ fontSize: 15 }}>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && recipes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {query || hasFilters ? (
            <>
              <span style={{ fontSize: 48 }}>🔍</span>
              <p style={{ fontSize: 16, color: 'var(--text-dim)' }}>No recipes match your search.</p>
              <button className="btn btn-primary" onClick={() => { setQuery(''); clearFilters() }}>Clear search</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 48 }}>🍽️</span>
              <p style={{ fontSize: 16, color: 'var(--text-dim)' }}>Your recipe collection is empty.</p>
              <button className="btn btn-primary" onClick={() => navigate('/add')}>Add your first recipe</button>
            </>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gap: 17, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {recipes.map(r => (
          <RecipeCard key={r.id} recipe={r} onClick={() => navigate(`/recipes/${r.id}`)} />
        ))}
      </div>
    </div>
  )
}
