import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function RecipeCard({ recipe, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
      padding: 16, cursor: 'pointer', transition: 'border-color 0.15s',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = '#7c6af7'}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}
    >
      {recipe.image_url && (
        <img src={recipe.image_url} alt=""
          style={{ position: 'absolute', top: 12, right: 12, width: 56, height: 56,
                   objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
      )}
      <div style={{ fontWeight: 600, marginBottom: 6, paddingRight: recipe.image_url ? 72 : 0 }}>
        {recipe.title}
      </div>
      <div style={{ color: '#888', fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {recipe.cuisine && <span>{recipe.cuisine}</span>}
        {recipe.category && <span>{recipe.category}</span>}
        {recipe.total_time && <span>{recipe.total_time} min</span>}
        {recipe.calories && <span>{Math.round(recipe.calories)} cal</span>}
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

  const selectStyle = {
    background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#ccc',
    borderRadius: 8, padding: '8px 12px', fontSize: 14, cursor: 'pointer',
  }

  return (
    <div className="page">
      <input
        type="text"
        placeholder="Search recipes..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        <select value={filters.cuisine} onChange={e => setFilter('cuisine', e.target.value)} style={selectStyle}>
          <option value="">All cuisines</option>
          {cuisines.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.category} onChange={e => setFilter('category', e.target.value)} style={selectStyle}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number" min="1" placeholder="Max time (min)"
          value={filters.max_time} onChange={e => setFilter('max_time', e.target.value)}
          style={{ ...selectStyle, width: 140 }}
        />
        {hasFilters && (
          <button onClick={clearFilters} style={{
            background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13,
          }}>Clear filters</button>
        )}
      </div>

      {loading && <p className="dim">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && recipes.length === 0 && (
        <p className="dim">{query || hasFilters ? 'No results.' : 'No recipes yet. Add one!'}</p>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {recipes.map(r => (
          <RecipeCard key={r.id} recipe={r} onClick={() => navigate(`/recipes/${r.id}`)} />
        ))}
      </div>
    </div>
  )
}
