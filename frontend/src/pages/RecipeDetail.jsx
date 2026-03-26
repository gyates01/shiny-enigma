import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function fmtTime(mins) {
  if (!mins) return null
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

const METRIC_RE = /\d+(?:\.\d+)?\s*(?:grams?|g|kg|kilograms?|ml|milliliters?|millilitres?|liters?|litres?)\b/i

function hasMetricUnits(ingredients = []) {
  return ingredients.some(ing => METRIC_RE.test(ing))
}

const CUP_FRACTIONS = [
  [7/8, '⅞'], [3/4, '¾'], [2/3, '⅔'], [5/8, '⅝'],
  [1/2, '½'], [3/8, '⅜'], [1/3, '⅓'], [1/4, '¼'], [1/8, '⅛'],
]

function fmtCups(cups) {
  if (cups <= 0) return '0 cups'
  const whole = Math.floor(cups)
  const frac = cups - whole
  let fracStr = ''
  if (frac > 0.05) {
    const match = CUP_FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.07)
    fracStr = match ? match[1] : `${+frac.toFixed(2)}`
  }
  const label = (whole + (frac > 0.05 ? 0.5 : 0)) > 1 ? 'cups' : 'cup'
  if (whole === 0) return `${fracStr} ${label}`
  if (!fracStr)    return `${whole} ${label}`
  return `${whole} ${fracStr} cups`
}

function mlToUsVolume(ml) {
  if (ml <= 7.5)  return `${+(ml / 4.929).toFixed(1)} tsp`
  if (ml <= 15)   return `${+(ml / 14.787).toFixed(1)} tbsp`
  if (ml < 59)    return `${+(ml / 14.787).toFixed(1)} tbsp`
  return fmtCups(ml / 236.588)
}

function toImperial(text) {
  // grams → oz (with helpful hints) or lbs
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:grams?|g)\b/gi, (_, n) => {
    const g = parseFloat(n)
    if (g >= 454) {
      const lbs = +(g / 453.592).toFixed(2)
      return `${lbs} lbs (~${fmtCups(lbs * 2)})`
    }
    const oz = +(g * 0.035274).toFixed(1)
    if (oz < 4) return `${oz} oz (~${+(g / 14.175).toFixed(1)} tbsp)`
    const cups = fmtCups(oz / 8)
    if (oz >= 15) return `${oz} oz (~1 lb / ~${cups})`
    if (oz >= 7 && oz <= 9) return `${oz} oz (~½ lb / ~${cups})`
    return `${oz} oz (~${cups})`
  })
  // kg → lbs
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:kilograms?|kg)\b/gi, (_, n) =>
    `${+(parseFloat(n) * 2.20462).toFixed(1)} lbs`
  )
  // ml → tsp / tbsp / cups
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:milliliters?|millilitres?|ml)\b/gi, (_, n) =>
    mlToUsVolume(parseFloat(n))
  )
  // L → cups or quarts
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:liters?|litres?|L)\b/g, (_, n) => {
    const cups = parseFloat(n) * 4.22675
    if (cups >= 4) return `${+(parseFloat(n) * 1.05669).toFixed(1)} qts`
    return fmtCups(cups)
  })
  return text
}

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState(null)
  const [checked, setChecked] = useState({})
  const [imperial, setImperial] = useState(false)
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
      <button onClick={() => navigate('/recipes')} style={{
        background: 'none', border: 'none', color: '#888', cursor: 'pointer',
        marginBottom: 16, fontSize: 14,
      }}>← Back</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{recipe.title}</h1>
        <button onClick={() => navigate(`/recipes/${id}/edit`)} style={{
          background: 'none', border: '1px solid #444', color: '#aaa', cursor: 'pointer',
          borderRadius: 6, padding: '6px 14px', fontSize: 13, marginLeft: 16, flexShrink: 0,
        }}>Edit</button>
      </div>

      {recipe.image_url && (
        <img
          src={recipe.image_url}
          alt={recipe.title}
          style={{ width: '100%', maxHeight: 750, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }}
        />
      )}

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ingredients</h2>
            {hasMetricUnits(recipe.ingredients) && (
              <button
                onClick={() => setImperial(v => !v)}
                style={{
                  background: imperial ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--accent)',
                  color: imperial ? '#fff' : 'var(--accent)',
                  borderRadius: 20, padding: '3px 12px', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {imperial ? '⇄ Metric' : '⇄ Imperial'}
              </button>
            )}
          </div>
          {recipe.ingredients.map((ing, i) => {
            const text = imperial ? toImperial(ing) : ing
            return (
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
                {text}
              </div>
            )
          })}
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
