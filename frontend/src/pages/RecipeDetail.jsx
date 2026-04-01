import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const isProd = import.meta.env.PROD


function cleanServings(s) {
  if (!s) return null
  // Strip Python list repr: "['4']" → "4", "['12', '12 cups']" → "12"
  const listMatch = s.match(/^\[['"]([^'"]+)/)
  if (listMatch) return listMatch[1]
  return s
}

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

const QUICK_PROMPTS = [
  { label: 'Substitutions', q: 'What are the best substitutions for each ingredient in this recipe?' },
  { label: 'Scale 2×',      q: 'Scale this recipe to double the servings. List every ingredient with the new quantity.' },
  { label: 'Wine pairing',  q: 'What wine or drink pairs best with this dish?' },
  { label: 'Make it vegan', q: 'How can I make this recipe fully vegan? List each swap needed.' },
]

function RecipeAssistant({ recipeId, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async (question) => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setInput('')
    setLoading(true)
    try {
      const { answer } = await api.askRecipe(recipeId, q)
      setMessages(prev => [...prev, { role: 'assistant', text: answer }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
      display: 'flex', justifyContent: 'center', padding: '0 16px 16px',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: '100%', maxWidth: 560, background: '#111827',
        border: '1px solid #1f2937', borderRadius: '16px 16px 12px 12px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)', pointerEvents: 'all',
        display: 'flex', flexDirection: 'column', maxHeight: '60vh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid #1f2937', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>✦ Recipe Assistant</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? 'rgba(124,106,247,0.2)' : '#1f2937',
                border: `1px solid ${m.role === 'user' ? 'rgba(124,106,247,0.35)' : '#374151'}`,
                borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '8px 12px', fontSize: 13, lineHeight: 1.5, color: '#f3f4f6',
                whiteSpace: 'pre-wrap',
              }}>{m.text}</div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start', background: '#1f2937', border: '1px solid #374151',
                borderRadius: '12px 12px 12px 4px', padding: '8px 12px', fontSize: 13, color: '#6b7280',
              }}>Thinking…</div>
            )}
          </div>
        )}

        {/* Quick prompts */}
        {messages.length === 0 && (
          <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {QUICK_PROMPTS.map(p => (
              <button key={p.label} onClick={() => send(p.q)} style={{
                background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)',
                color: '#a78bfa', borderRadius: 20, padding: '5px 12px', fontSize: 12,
                cursor: 'pointer', fontWeight: 500,
              }}>{p.label}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', flexShrink: 0 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Ask anything about this recipe…"
            disabled={loading}
            style={{
              flex: 1, background: '#1f2937', border: '1px solid #374151',
              borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13,
            }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{
            background: '#7c6af7', border: 'none', color: '#fff', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}>↑</button>
        </div>
      </div>
    </div>
  )
}

function MadeItModal({ onSave, onCancel }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (skipRating) => {
    setSaving(true)
    await onSave(skipRating ? null : (rating || null), note.trim() || null)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{
        background: '#111827', border: '1px solid #1f2937', borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 360,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Log this cook</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
          {[1,2,3,4,5].map(n => (
            <span key={n}
              onClick={() => setRating(n === rating ? 0 : n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              style={{
                fontSize: 28, cursor: 'pointer',
                color: n <= (hovered || rating) ? '#fbbf24' : '#374151',
                transition: 'color 0.1s',
              }}>★</span>
          ))}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note (e.g. added extra garlic...)"
          rows={3}
          style={{
            width: '100%', background: '#1f2937', border: '1px solid #374151',
            borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 13,
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => submit(false)} disabled={saving} style={{
            flex: 1, background: '#7c6af7', border: 'none', color: '#fff',
            borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer',
            opacity: saving ? 0.6 : 1, fontWeight: 600,
          }}>Save</button>
          <button onClick={() => submit(true)} disabled={saving} style={{
            flex: 1, background: '#1f2937', border: '1px solid #374151', color: '#9ca3af',
            borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>Skip</button>
        </div>
      </div>
    </div>
  )
}

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState(null)
  const [checked, setChecked] = useState({})
  const [imperial, setImperial] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [pantryEmpty, setPantryEmpty] = useState(true)
  const [cookModal, setCookModal] = useState(false)
  const [cookCount, setCookCount] = useState(0)
  const [lastCooked, setLastCooked] = useState(null)
  const [cookConfirm, setCookConfirm] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)

  useEffect(() => {
    api.getRecipe(id)
      .then(r => {
        setRecipe(r)
        setCookCount(r.cook_count ?? 0)
        setLastCooked(r.last_cooked_at ?? null)
      })
      .catch(e => setError(e.message))
    if (!isProd) {
      fetch('/api/pantry')
        .then(r => r.json())
        .then(items => setPantryEmpty(items.length === 0))
        .catch(() => {})
    }
  }, [id])

  const handleCookSave = async (rating, note) => {
    try {
      await api.logCook(id, rating, note)
      setCookCount(c => c + 1)
      setLastCooked(new Date().toISOString())
      setCookConfirm('Logged!')
      setTimeout(() => setCookConfirm(''), 3000)
    } catch {
      setCookConfirm('Failed to save')
      setTimeout(() => setCookConfirm(''), 3000)
    }
    setCookModal(false)
  }

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

  const hasOnHand = recipe.ingredients?.some(i => i.on_hand) ?? false

  const metaChips = [
    recipe.cuisine    && { label: recipe.cuisine,                    color: '#c4b8ff', bg: 'rgba(124,106,247,0.12)', border: 'rgba(124,106,247,0.25)' },
    recipe.category   && { label: recipe.category,                   color: '#2dd4bf', bg: 'rgba(20,184,166,0.1)',   border: 'rgba(20,184,166,0.25)'  },
    cleanServings(recipe.servings) && { label: `${cleanServings(recipe.servings)} servings`, color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
    fmtTime(recipe.total_time)     && { label: `⏱ ${fmtTime(recipe.total_time)}`,           color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
  ].filter(Boolean)

  const nutritionCards = [
    recipe.calories  && { label: 'Calories', value: `${Math.round(recipe.calories)}`,       unit: 'kcal'    },
    recipe.protein_g && { label: 'Protein',  value: recipe.protein_g.toFixed(1),            unit: 'g'       },
    recipe.carbs_g   && { label: 'Carbs',    value: recipe.carbs_g.toFixed(1),              unit: 'g'       },
    recipe.fat_g     && { label: 'Fat',      value: recipe.fat_g.toFixed(1),                unit: 'g'       },
  ].filter(Boolean)

  return (
    <>
    <div className="page" style={recipe.image_url ? { paddingBottom: 0 } : undefined}>
      <button onClick={() => navigate('/recipes')} style={{
        background: 'none', border: 'none', color: '#888', cursor: 'pointer',
        marginBottom: 16, fontSize: 14,
      }}>← Back</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{recipe.title}</h1>
        <div style={{ display: 'flex', gap: 8, marginLeft: 16, flexShrink: 0 }}>
          <button onClick={() => setAssistantOpen(o => !o)} style={{
            background: assistantOpen ? 'rgba(124,106,247,0.2)' : 'rgba(124,106,247,0.08)',
            border: '1px solid rgba(124,106,247,0.35)',
            color: '#a78bfa', cursor: 'pointer', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 500,
          }}>✦ Ask</button>
          <button onClick={() => setCookModal(true)} style={{
            background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.35)',
            color: '#a78bfa', cursor: 'pointer', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 500,
          }}>✓ Made it</button>
          <button onClick={() => navigate(`/recipes/${id}/edit`)} style={{
            background: 'none', border: '1px solid #444', color: '#aaa', cursor: 'pointer',
            borderRadius: 6, padding: '6px 14px', fontSize: 13,
          }}>Edit</button>
          <button onClick={handleDelete} disabled={deleting} style={{
            background: 'none', border: '1px solid #7f1d1d', color: '#f87171', cursor: 'pointer',
            borderRadius: 6, padding: '6px 14px', fontSize: 13, opacity: deleting ? 0.5 : 1,
          }}>{deleting ? '...' : 'Delete'}</button>
        </div>
      </div>

      {cookCount > 0 && (
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
          Made {cookCount}× · last {new Date(lastCooked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
      {cookConfirm && (
        <div style={{ fontSize: 13, color: '#6ee7b7', marginBottom: 4 }}>{cookConfirm}</div>
      )}

      {recipe.image_url && (
        <div style={{
          position: 'sticky', top: 'var(--nav-height-top)', zIndex: 0,
          borderRadius: '12px 12px 0 0', overflow: 'hidden', marginTop: 8,
        }}>
          <img src={recipe.image_url} alt={recipe.title}
            style={{ width: '100%', display: 'block' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
            background: 'linear-gradient(to bottom, transparent, var(--bg))',
          }} />
        </div>
      )}

      <div style={{
        position: 'relative', zIndex: 1, background: 'var(--bg)',
        ...(recipe.image_url ? { borderRadius: '20px 20px 0 0', marginTop: -28, paddingTop: 24, paddingBottom: 24 } : {}),
      }}>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 0 24px' }}>
        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noreferrer"
             style={{ color: '#6b7280', fontSize: 12, wordBreak: 'break-all', marginBottom: metaChips.length ? 12 : 0, textAlign: 'center' }}>
            {recipe.source_url}
          </a>
        )}

        {metaChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: nutritionCards.length ? 14 : 0 }}>
            {metaChips.map(c => (
              <span key={c.label} style={{
                background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 500,
              }}>{c.label}</span>
            ))}
          </div>
        )}

        {nutritionCards.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4, width: '100%', maxWidth: 380 }}>
            {nutritionCards.map(n => (
              <div key={n.label} style={{
                background: '#111827', border: '1px solid #1f2937', borderRadius: 10,
                padding: '10px 14px', textAlign: 'center', flex: '1 0 70px',
              }}>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{n.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f3f4f6', lineHeight: 1 }}>{n.value}</div>
                <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{n.unit}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {recipe.ingredients?.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ingredients</h2>
            {hasMetricUnits(recipe.ingredients.map(i => i.text)) && (
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

          {isProd ? (
            // Production: flat checklist, no pantry UI
            recipe.ingredients.map((ing, i) => {
              const text = imperial ? toImperial(ing.text) : ing.text
              return (
                <div key={i} onClick={() => toggleCheck(i)}
                  role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
                  onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: '1px solid #1e1e1e', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, border: '2px solid',
                    borderColor: checked[i] ? '#7c6af7' : '#444',
                    background: checked[i] ? '#7c6af7' : 'transparent',
                    flexShrink: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, color: '#fff',
                  }}>
                    {checked[i] && '✓'}
                  </span>
                  <span style={{
                    fontSize: 14,
                    color: checked[i] ? '#555' : '#f3f4f6',
                    textDecoration: checked[i] ? 'line-through' : 'none',
                  }}>
                    {text}
                  </span>
                </div>
              )
            })
          ) : (
            // Dev: pantry on-hand sections with checklist rows
            <>
              {pantryEmpty && (
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                  Add items to your pantry to see what you have on hand.
                </p>
              )}

              {hasOnHand && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>On hand</div>
                  {recipe.ingredients.map((ing, i) => !ing.on_hand ? null : (
                    <div key={i} onClick={() => toggleCheck(i)}
                      role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
                      onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderBottom: '1px solid #1e1e1e',
                        borderLeft: '3px solid #22c55e', paddingLeft: 10, cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, border: '2px solid',
                        borderColor: checked[i] ? '#7c6af7' : '#444',
                        background: checked[i] ? '#7c6af7' : 'transparent',
                        flexShrink: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, color: '#fff',
                      }}>
                        {checked[i] && '✓'}
                      </span>
                      <span style={{
                        flex: 1,
                        fontSize: 14,
                        color: checked[i] ? '#555' : '#f3f4f6',
                        textDecoration: checked[i] ? 'line-through' : 'none',
                      }}>
                        {imperial ? toImperial(ing.text) : ing.text}
                      </span>
                      {ing.stock_mode === 'level' && ing.stock_value && (
                        <span style={{
                          background: ing.stock_value === 'full' ? '#14532d' : ing.stock_value === 'med' ? '#451a03' : '#450a0a',
                          color:      ing.stock_value === 'full' ? '#86efac' : ing.stock_value === 'med' ? '#fcd34d' : '#fca5a5',
                          borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>{ing.stock_value}</span>
                      )}
                      {ing.backup_value && ing.backup_value !== '0' && (
                        <span style={{
                          background: '#1f2937', border: '1px solid #374151', color: '#9ca3af',
                          borderRadius: 8, padding: '1px 7px', fontSize: 11,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {ing.stock_mode === 'qty'
                            ? `${ing.backup_value} lbs frozen`
                            : `+${ing.backup_value} backup`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {recipe.ingredients.some(i => !i.on_hand) && (
                <div style={{ marginBottom: 12 }}>
                  {hasOnHand && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>Still need</div>
                  )}
                  {recipe.ingredients.map((ing, i) => ing.on_hand ? null : (
                    <div key={i} onClick={() => toggleCheck(i)}
                      role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
                      onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderBottom: '1px solid #1e1e1e',
                        borderLeft: hasOnHand ? '3px solid #ef4444' : 'none',
                        paddingLeft: hasOnHand ? 10 : 0,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, border: '2px solid',
                        borderColor: checked[i] ? '#7c6af7' : '#444',
                        background: checked[i] ? '#7c6af7' : 'transparent',
                        flexShrink: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, color: '#fff',
                      }}>
                        {checked[i] && '✓'}
                      </span>
                      <span style={{
                        fontSize: 14,
                        color: checked[i] ? '#555' : '#f3f4f6',
                        textDecoration: checked[i] ? 'line-through' : 'none',
                      }}>
                        {imperial ? toImperial(ing.text) : ing.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}


            </>
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

      </div>
    </div>

    {cookModal && (
      <MadeItModal onSave={handleCookSave} onCancel={() => setCookModal(false)} />
    )}
    <RecipeAssistant recipeId={id} open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </>
  )
}
