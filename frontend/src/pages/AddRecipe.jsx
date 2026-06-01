import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function AddRecipe() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const [duplicate, setDuplicate] = useState(null)
  const navigate = useNavigate()

  const handleAdd = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setSaved(null)
    setDuplicate(null)
    try {
      const recipe = await api.addRecipe(url.trim())
      setSaved(recipe)
      setUrl('')
    } catch (e) {
      if (e.existing) setDuplicate(e.existing)
      else setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Add Recipe</h1>

      <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-lg)', color: 'var(--muted)' }}>
        Recipe URL
      </label>
      <input
        type="url"
        placeholder="https://www.allrecipes.com/recipe/..."
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !loading && handleAdd()}
        disabled={loading}
        style={{ marginBottom: 'var(--space-3)' }}
      />

      <button
        className="btn btn-primary"
        onClick={handleAdd}
        disabled={loading || !url.trim()}
        style={{ width: '100%' }}
      >
        {loading ? 'Saving...' : 'Add Recipe'}
      </button>

      {loading && (
        <p className="dim" style={{ marginTop: 12, textAlign: 'center' }}>
          Fetching recipe... this can take a few seconds.
        </p>
      )}

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      {duplicate && (
        <div style={{
          marginTop: 'var(--space-5)', padding: 'var(--space-4)',
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 10,
        }}>
          <p style={{ color: '#f5a623', fontWeight: 600, marginBottom: 10 }}>
            ⚠ Already in your collection: {duplicate.title}
          </p>
          <button className="btn btn-primary" onClick={() => navigate(`/recipes/${duplicate.id}`)}>
            View Recipe
          </button>
        </div>
      )}

      {saved && (
        <div style={{
          marginTop: 'var(--space-5)', padding: 'var(--space-4)', background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10,
        }}>
          <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 10 }}>
            Saved: {saved.title}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/recipes/${saved.id}`)}>
              View Recipe
            </button>
            <button className="btn" style={{ background: 'var(--card2)', color: 'var(--muted)' }}
              onClick={() => setSaved(null)}>
              Add Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
