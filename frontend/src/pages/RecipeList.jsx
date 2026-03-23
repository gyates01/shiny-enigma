import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function RecipeCard({ recipe, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
      padding: 16, cursor: 'pointer', transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = '#7c6af7'}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{recipe.title}</div>
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
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const load = useCallback(async (q) => {
    try {
      const data = await api.listRecipes(q || '')
      setRecipes(data)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(query), query ? 300 : 0)
    return () => clearTimeout(timer)
  }, [query, load])

  return (
    <div className="page">
      <input
        type="text"
        placeholder="Search recipes..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 20 }}
      />
      {loading && <p className="dim">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && recipes.length === 0 && (
        <p className="dim">{query ? 'No results.' : 'No recipes yet. Add one!'}</p>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {recipes.map(r => (
          <RecipeCard key={r.id} recipe={r} onClick={() => navigate(`/recipes/${r.id}`)} />
        ))}
      </div>
    </div>
  )
}
