import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getCategoryAccent } from '../lib/categoryUtils'

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

function TodoistPickCircle({ index, picked, onToggle }) {
  return (
    <span onClick={e => onToggle(index, e)} style={{
      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${picked ? 'var(--danger-text)' : 'var(--border2)'}`,
      background: picked ? 'var(--danger-text)' : 'transparent',
      cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 9, color: '#fff',
    }}>{picked && '✓'}</span>
  )
}

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
    <div className="recipe-assistant" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
      display: 'flex', justifyContent: 'center', padding: '0 16px 16px',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: '100%', maxWidth: 560, background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--card-radius-lg) var(--card-radius-lg) var(--card-radius) var(--card-radius)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)', pointerEvents: 'all',
        display: 'flex', flexDirection: 'column', maxHeight: '60vh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border2)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--accent-light)' }}>✦ Recipe Assistant</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? 'rgba(124,106,247,0.2)' : 'var(--card2)',
                border: `1px solid ${m.role === 'user' ? 'rgba(124,106,247,0.35)' : 'var(--border2)'}`,
                borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '8px 12px', fontSize: 'var(--text-md)', lineHeight: 1.5, color: 'var(--text)',
                whiteSpace: 'pre-wrap',
              }}>{m.text}</div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start', background: 'var(--card2)', border: '1px solid var(--border2)',
                borderRadius: '12px 12px 12px 4px', padding: '8px 12px', fontSize: 'var(--text-md)', color: 'var(--dim)',
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
                color: 'var(--accent-light)', borderRadius: 20, padding: '5px 12px', fontSize: 'var(--text-sm)',
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
              flex: 1, background: 'var(--card2)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 'var(--text-md)',
            }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{
            background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 8,
            padding: '8px 14px', fontSize: 'var(--text-md)', cursor: 'pointer', fontWeight: 600,
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
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius-lg)',
        padding: 'var(--space-7)', width: '100%', maxWidth: 360,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Log this cook</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
          {[1,2,3,4,5].map(n => (
            <span key={n}
              onClick={() => setRating(n === rating ? 0 : n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              style={{
                fontSize: 28, cursor: 'pointer',
                color: n <= (hovered || rating) ? '#fbbf24' : 'var(--border2)',
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
            width: '100%', background: 'var(--card2)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 'var(--text-md)',
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => submit(false)} disabled={saving} style={{
            flex: 1, background: 'var(--accent)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '10px 0', fontSize: 'var(--text-lg)', cursor: 'pointer',
            opacity: saving ? 0.6 : 1, fontWeight: 600,
          }}>Save</button>
          <button onClick={() => submit(true)} disabled={saving} style={{
            flex: 1, background: 'var(--card2)', border: '1px solid var(--border2)', color: 'var(--muted)',
            borderRadius: 8, padding: '10px 0', fontSize: 'var(--text-lg)', cursor: 'pointer',
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
  const [todoistConnected, setTodoistConnected] = useState(null)
  const [todoistMsg, setTodoistMsg] = useState('')
  const [todoistLoading, setTodoistLoading] = useState(false)
  const [todoistPicked, setTodoistPicked] = useState(new Set())

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
    // Check for ?todoist=connected after OAuth redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('todoist') === 'connected') {
      setTodoistMsg('Todoist connected ✓')
      setTimeout(() => setTodoistMsg(''), 4000)
      window.history.replaceState({}, '', window.location.pathname)
    }
    api.getTodoistStatus().then(s => setTodoistConnected(s.connected)).catch(() => {})
  }, [id])

  const toggleTodoistPick = (i, e) => {
    e.stopPropagation()
    setTodoistPicked(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const handleSendToTodoist = async () => {
    if (!todoistConnected) {
      window.open(api.todoistAuthUrl(), '_blank')
      return
    }
    const allIngredients = recipe.ingredients?.map(i => i.text ?? i) ?? []
    const toSend = todoistPicked.size > 0
      ? [...todoistPicked].map(i => allIngredients[i]).filter(Boolean)
      : allIngredients
    setTodoistLoading(true)
    setTodoistMsg('Sending to Todoist…')
    try {
      const { sent } = await api.sendToTodoist(id, toSend)
      setTodoistMsg(sent > 0 ? `${sent} items sent to Todoist ✓` : 'Nothing to send')
      setTodoistPicked(new Set())
    } catch (e) {
      setTodoistMsg(`Error: ${e.message}`)
      setTimeout(() => setTodoistMsg(''), 5000)
    } finally {
      setTodoistLoading(false)
    }
  }

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

  const catAccent = getCategoryAccent(recipe.category)
  const metaChips = [
    recipe.cuisine    && { label: recipe.cuisine,   color: '#c4b8ff', bg: 'rgba(124,106,247,0.12)', border: 'rgba(124,106,247,0.25)' },
    recipe.category   && { label: recipe.category,  color: catAccent, bg: `${catAccent}1a`,         border: `${catAccent}40`         },
    cleanServings(recipe.servings) && { label: `${cleanServings(recipe.servings)} servings`, color: 'var(--muted)', bg: 'rgba(157,160,184,0.08)', border: 'rgba(157,160,184,0.2)' },
    fmtTime(recipe.total_time)     && { label: `⏱ ${fmtTime(recipe.total_time)}`,           color: 'var(--muted)', bg: 'rgba(157,160,184,0.08)', border: 'rgba(157,160,184,0.2)' },
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
        background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer',
        marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)',
      }}>← Back</button>

      <div className="recipe-header">
        <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{recipe.title}</h1>
        <div className="recipe-actions">
          <button onClick={() => setAssistantOpen(o => !o)} style={{
            background: assistantOpen ? 'rgba(124,106,247,0.2)' : 'rgba(124,106,247,0.08)',
            border: '1px solid rgba(124,106,247,0.35)',
            color: 'var(--accent-light)', cursor: 'pointer', borderRadius: 6, padding: '6px 14px', fontSize: 'var(--text-md)', fontWeight: 500,
          }}>✦ Ask</button>
          <button onClick={() => setCookModal(true)} style={{
            background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.35)',
            color: 'var(--accent-light)', cursor: 'pointer', borderRadius: 6, padding: '6px 14px', fontSize: 'var(--text-md)', fontWeight: 500,
          }}>✓ Made it</button>
          <button onClick={() => navigate(`/recipes/${id}/edit`)} style={{
            background: 'none', border: '1px solid var(--border2)', color: 'var(--muted)', cursor: 'pointer',
            borderRadius: 6, padding: '6px 14px', fontSize: 'var(--text-md)',
          }}>Edit</button>
          <button onClick={handleDelete} disabled={deleting} style={{
            background: 'none', border: '1px solid var(--danger-bg)', color: '#f87171', cursor: 'pointer',
            borderRadius: 6, padding: '6px 14px', fontSize: 'var(--text-md)', opacity: deleting ? 0.5 : 1,
          }}>{deleting ? '...' : 'Delete'}</button>
        </div>
      </div>

      {cookCount > 0 && (
        <div style={{ fontSize: 'var(--text-md)', color: 'var(--dim)', marginBottom: 'var(--space-1)' }}>
          Made {cookCount}× · last {new Date(lastCooked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
      {cookConfirm && (
        <div style={{ fontSize: 'var(--text-md)', color: 'var(--success)', marginBottom: 'var(--space-1)' }}>{cookConfirm}</div>
      )}

      {recipe.image_url && (
        <div style={{
          position: 'sticky', top: 'var(--nav-height-top)', zIndex: 0,
          borderRadius: '12px 12px 0 0', overflow: 'hidden', marginTop: 8,
        }}>
          <div style={{ height: 4, background: getCategoryAccent(recipe.category) }} />
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
             style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)', wordBreak: 'break-all', marginBottom: metaChips.length ? 12 : 0, textAlign: 'center' }}>
            {recipe.source_url}
          </a>
        )}

        {metaChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: nutritionCards.length ? 14 : 0 }}>
            {metaChips.map(c => (
              <span key={c.label} style={{
                background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                borderRadius: 20, padding: '4px 12px', fontSize: 'var(--text-sm)', fontWeight: 500,
              }}>{c.label}</span>
            ))}
          </div>
        )}

        {nutritionCards.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4, width: '100%', maxWidth: 380 }}>
            {nutritionCards.map(n => (
              <div key={n.label} style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)',
                padding: '10px 14px', textAlign: 'center', flex: '1 0 70px',
              }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{n.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{n.value}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', marginTop: 2 }}>{n.unit}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {todoistMsg && (
        <div style={{ fontSize: 'var(--text-md)', color: todoistLoading ? 'var(--dim)' : 'var(--success)', marginBottom: 'var(--space-2)' }}>{todoistMsg}</div>
      )}

      {recipe.ingredients?.length > 0 && (
        <section style={{ marginBottom: 'var(--space-7)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ingredients</h2>
            {hasMetricUnits(recipe.ingredients.map(i => i.text)) && (
              <button
                onClick={() => setImperial(v => !v)}
                style={{
                  background: imperial ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--accent)',
                  color: imperial ? '#fff' : 'var(--accent)',
                  borderRadius: 20, padding: '3px 12px', fontSize: 'var(--text-sm)',
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {imperial ? '⇄ Metric' : '⇄ Imperial'}
              </button>
            )}
            <button onClick={handleSendToTodoist} disabled={todoistLoading} style={{
              marginLeft: 'auto',
              background: todoistConnected ? 'rgba(220,38,38,0.1)' : 'rgba(220,38,38,0.06)',
              border: '1px solid rgba(220,38,38,0.3)',
              color: 'var(--danger-text)', borderRadius: 20, padding: '3px 12px', fontSize: 'var(--text-sm)',
              fontWeight: 600, cursor: 'pointer', opacity: todoistLoading ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}>
              {todoistLoading ? '…' : todoistConnected
                ? todoistPicked.size > 0 ? `Send ${todoistPicked.size} to Todoist` : 'Send to Todoist'
                : '+ Connect Todoist'}
            </button>
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
                    padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, border: '2px solid',
                    borderColor: checked[i] ? 'var(--accent)' : 'var(--border2)',
                    background: checked[i] ? 'var(--accent)' : 'transparent',
                    flexShrink: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 'var(--text-xs)', color: '#fff',
                  }}>
                    {checked[i] && '✓'}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: 'var(--text-lg)',
                    color: checked[i] ? 'var(--faint)' : 'var(--text)',
                    textDecoration: checked[i] ? 'line-through' : 'none',
                  }}>
                    {text}
                  </span>
                  {todoistConnected && <TodoistPickCircle index={i} picked={todoistPicked.has(i)} onToggle={toggleTodoistPick} />}
                </div>
              )
            })
          ) : (
            // Dev: pantry on-hand sections with checklist rows
            <>
              {pantryEmpty && (
                <p style={{ fontSize: 'var(--text-md)', color: 'var(--dim)', marginBottom: 'var(--space-2)' }}>
                  Add items to your pantry to see what you have on hand.
                </p>
              )}

              {hasOnHand && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>On hand</div>
                  {recipe.ingredients.map((ing, i) => !ing.on_hand ? null : (
                    <div key={i} onClick={() => toggleCheck(i)}
                      role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
                      onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 0', borderBottom: '1px solid var(--border)',
                        borderLeft: '3px solid var(--success)', paddingLeft: 10, cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, border: '2px solid',
                        borderColor: checked[i] ? 'var(--accent)' : 'var(--border2)',
                        background: checked[i] ? 'var(--accent)' : 'transparent',
                        flexShrink: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 'var(--text-xs)', color: '#fff',
                      }}>
                        {checked[i] && '✓'}
                      </span>
                      <span style={{
                        flex: 1,
                        fontSize: 14,
                        color: checked[i] ? 'var(--faint)' : 'var(--text)',
                        textDecoration: checked[i] ? 'line-through' : 'none',
                      }}>
                        {imperial ? toImperial(ing.text) : ing.text}
                      </span>
                      {ing.stock_mode === 'level' && ing.stock_value && (
                        <span style={{
                          background: ing.stock_value === 'full' ? 'var(--success-bg)' : ing.stock_value === 'med' ? 'var(--warning-bg)' : 'var(--danger-bg)',
                          color:      ing.stock_value === 'full' ? 'var(--success-text)' : ing.stock_value === 'med' ? 'var(--warning-text)' : 'var(--danger-text)',
                          borderRadius: 6, padding: '1px 7px', fontSize: 'var(--text-xs)', fontWeight: 600,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>{ing.stock_value}</span>
                      )}
                      {ing.backup_value && ing.backup_value !== '0' && (
                        <span style={{
                          background: 'var(--card2)', border: '1px solid var(--border2)', color: 'var(--muted)',
                          borderRadius: 8, padding: '1px 7px', fontSize: 11,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {ing.stock_mode === 'qty'
                            ? `${ing.backup_value} lbs frozen`
                            : `+${ing.backup_value} backup`}
                        </span>
                      )}
                      {todoistConnected && (
                        <span onClick={e => toggleTodoistPick(i, e)} style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${todoistPicked.has(i) ? '#f87171' : 'var(--border2)'}`,
                          background: todoistPicked.has(i) ? '#f87171' : 'transparent',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 9, color: '#fff',
                        }}>{todoistPicked.has(i) ? '✓' : ''}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {recipe.ingredients.some(i => !i.on_hand) && (
                <div style={{ marginBottom: 12 }}>
                  {hasOnHand && (
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>Still need</div>
                  )}
                  {recipe.ingredients.map((ing, i) => ing.on_hand ? null : (
                    <div key={i} onClick={() => toggleCheck(i)}
                      role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
                      onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 0', borderBottom: '1px solid var(--border)',
                        borderLeft: hasOnHand ? '3px solid var(--danger)' : 'none',
                        paddingLeft: hasOnHand ? 10 : 0,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, border: '2px solid',
                        borderColor: checked[i] ? 'var(--accent)' : 'var(--border2)',
                        background: checked[i] ? 'var(--accent)' : 'transparent',
                        flexShrink: 0, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 'var(--text-xs)', color: '#fff',
                      }}>
                        {checked[i] && '✓'}
                      </span>
                      <span style={{
                        flex: 1,
                        fontSize: 14,
                        color: checked[i] ? 'var(--faint)' : 'var(--text)',
                        textDecoration: checked[i] ? 'line-through' : 'none',
                      }}>
                        {imperial ? toImperial(ing.text) : ing.text}
                      </span>
                      {todoistConnected && (
                        <span onClick={e => toggleTodoistPick(i, e)} style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${todoistPicked.has(i) ? '#f87171' : 'var(--border2)'}`,
                          background: todoistPicked.has(i) ? '#f87171' : 'transparent',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 9, color: '#fff',
                        }}>{todoistPicked.has(i) ? '✓' : ''}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}


            </>
          )}
        </section>
      )}

      {recipe.instructions?.length > 0 && (
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-3)' }}>Instructions</h2>
          {recipe.instructions.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
              <span style={{
                background: 'var(--accent)', color: '#fff', borderRadius: '50%',
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-sm)', fontWeight: 700, flexShrink: 0,
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
