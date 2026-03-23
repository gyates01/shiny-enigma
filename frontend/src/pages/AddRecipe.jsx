import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function AddRecipe() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const navigate = useNavigate()

  const handleAdd = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setSaved(null)
    try {
      const recipe = await api.addRecipe(url.trim())
      setSaved(recipe)
      setUrl('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Add Recipe</h1>

      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#888' }}>
        Recipe URL
      </label>
      <input
        type="url"
        placeholder="https://www.allrecipes.com/recipe/..."
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !loading && handleAdd()}
        disabled={loading}
        style={{ marginBottom: 12 }}
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

      {saved && (
        <div style={{
          marginTop: 20, padding: 16, background: '#1a2a1a',
          border: '1px solid #2a4a2a', borderRadius: 10,
        }}>
          <p style={{ color: '#6fcf6f', fontWeight: 600, marginBottom: 10 }}>
            Saved: {saved.title}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/recipes/${saved.id}`)}>
              View Recipe
            </button>
            <button className="btn" style={{ background: '#2a2a2a', color: '#ccc' }}
              onClick={() => setSaved(null)}>
              Add Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
