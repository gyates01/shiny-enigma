import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function fmtTime(mins) {
  if (!mins) return null
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState(null)
  const [checked, setChecked] = useState({})
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.getRecipe(id)
      .then(setRecipe)
      .catch(e => setError(e.message))
  }, [id])

  const toggleCheck = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }))

  const handleDelete = async () => {
    if (!confirm('Delete this recipe?')) return
    setDeleting(true)
    try {
      await api.deleteRecipe(id)
      navigate('/recipes')
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!recipe) return <div className="page"><p className="dim">Loading...</p></div>

  const meta = [
    recipe.cuisine && `Cuisine: ${recipe.cuisine}`,
    recipe.category && `Category: ${recipe.category}`,
    recipe.servings && `Serves: ${recipe.servings}`,
    fmtTime(recipe.total_time) && `Time: ${fmtTime(recipe.total_time)}`,
  ].filter(Boolean)

  const nutrition = [
    recipe.calories && `${Math.round(recipe.calories)} cal`,
    recipe.protein_g && `${recipe.protein_g.toFixed(1)}g protein`,
    recipe.carbs_g && `${recipe.carbs_g.toFixed(1)}g carbs`,
    recipe.fat_g && `${recipe.fat_g.toFixed(1)}g fat`,
  ].filter(Boolean)

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{
        background: 'none', border: 'none', color: '#888', cursor: 'pointer',
        marginBottom: 16, fontSize: 14,
      }}>← Back</button>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{recipe.title}</h1>
      <a href={recipe.source_url} target="_blank" rel="noreferrer"
         style={{ color: '#7c6af7', fontSize: 13, wordBreak: 'break-all' }}>
        {recipe.source_url}
      </a>

      {meta.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0', fontSize: 14, color: '#888' }}>
          {meta.map(m => <span key={m}>{m}</span>)}
        </div>
      )}

      {nutrition.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24, fontSize: 14, color: '#aaa' }}>
          {nutrition.map(n => <span key={n}>{n}</span>)}
        </div>
      )}

      {recipe.ingredients?.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Ingredients</h2>
          {recipe.ingredients.map((ing, i) => (
            <div key={i} onClick={() => toggleCheck(i)}
              role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
              onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
              style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '8px 0', borderBottom: '1px solid #1e1e1e', cursor: 'pointer',
              textDecoration: checked[i] ? 'line-through' : 'none',
              color: checked[i] ? '#555' : 'inherit',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 4, border: '2px solid',
                borderColor: checked[i] ? '#7c6af7' : '#444',
                background: checked[i] ? '#7c6af7' : 'transparent',
                flexShrink: 0, marginTop: 2,
              }} />
              {ing}
            </div>
          ))}
        </section>
      )}

      {recipe.instructions?.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Instructions</h2>
          {recipe.instructions.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
              <span style={{
                background: '#7c6af7', color: '#fff', borderRadius: '50%',
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</span>
              <p style={{ lineHeight: 1.6, paddingTop: 3 }}>{step}</p>
            </div>
          ))}
        </section>
      )}

      <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
        {deleting ? 'Deleting...' : 'Delete Recipe'}
      </button>
    </div>
  )
}
