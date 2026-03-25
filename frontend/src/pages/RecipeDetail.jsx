import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// Mirrors api/utils/normalizer.py — strips quantities/units/prep from ingredient strings
function normalizeIngredient(text) {
  let s = text.toLowerCase();
  s = s.replace(/\s*,.*$|\s*\(.*?\)|\s*;.*$/g, '');
  s = s.replace(/^\s*(?:a\s+(?:pinch|dash|handful)\s+of\s+)?(?:\d[\d\s/.\-]*\s*)?/, '');
  s = s.replace(/^(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|grams?|g\b|kg|cloves?|stalks?|heads?|bags?|cans?|pieces?|sprigs?|pinch(?:es)?|dashes?)\s+/i, '');
  s = s.replace(/\b(?:fresh|freshly|dried|large|small|medium|extra|virgin|fine|ground|whole|raw|divided|ripe|firm|cooked|chopped|sliced|diced)\b\s*/gi, '');
  s = s.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

function AddMissingButton({ missingIngredients }) {
  const [status, setStatus] = useState('');

  async function handleClick() {
    setStatus('Adding...');
    let added = 0;
    for (const text of missingIngredients) {
      const name = normalizeIngredient(text);
      if (!name) continue;
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(() => null);
      if (res && res.status === 201) added++;
      // 409 = already in pantry, silently skip
    }
    setStatus(added > 0 ? `Added ${added} item${added !== 1 ? 's' : ''} to pantry` : 'All already in pantry');
    setTimeout(() => setStatus(''), 3000);
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={handleClick}
        style={{
          background: '#1f2937', color: '#9ca3af', border: '1px solid #374151',
          borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        }}
      >
        Add missing to pantry
      </button>
      {status && <span style={{ marginLeft: 10, fontSize: 12, color: '#6ee7b7' }}>{status}</span>}
    </div>
  );
}

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
  const [pantryEmpty, setPantryEmpty] = useState(true)

  useEffect(() => {
    api.getRecipe(id)
      .then(setRecipe)
      .catch(e => setError(e.message))
    fetch('/api/pantry')
      .then(r => r.json())
      .then(items => setPantryEmpty(items.length === 0))
      .catch(() => {})
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
          style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }}
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
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Ingredients</h2>

          {/* Pantry prompt — only when pantry is truly empty */}
          {pantryEmpty && recipe.ingredients.length > 0 && (
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              Add items to your pantry to see what you have on hand.
            </p>
          )}

          {/* On hand section */}
          {recipe.ingredients.some(i => i.on_hand) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>On hand</div>
              {recipe.ingredients.filter(i => i.on_hand).map((ing, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px', background: '#1f2937',
                  borderLeft: '3px solid #22c55e', borderRadius: 8, marginBottom: 3,
                  color: '#f3f4f6', fontSize: 14,
                }}>
                  {ing.text}
                </div>
              ))}
            </div>
          )}

          {/* Still need section */}
          {recipe.ingredients.some(i => !i.on_hand) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>
                {recipe.ingredients.some(i => i.on_hand) ? 'Still need' : 'Ingredients'}
              </div>
              {recipe.ingredients.filter(i => !i.on_hand).map((ing, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px', background: '#1f2937',
                  borderLeft: recipe.ingredients.some(i => i.on_hand) ? '3px solid #ef4444' : '3px solid #374151',
                  borderRadius: 8, marginBottom: 3,
                  color: '#f3f4f6', fontSize: 14,
                }}>
                  {ing.text}
                </div>
              ))}
            </div>
          )}

          {/* Add missing to pantry */}
          {recipe.ingredients.some(i => !i.on_hand) && (
            <AddMissingButton missingIngredients={recipe.ingredients.filter(i => !i.on_hand).map(i => i.text)} />
          )}
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
