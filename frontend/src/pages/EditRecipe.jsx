import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function EditRecipe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [imageError, setImageError] = useState('')

  useEffect(() => {
    api.getRecipe(id)
      .then(r => setForm({
        title: r.title || '',
        description: r.description || '',
        servings: (() => {
          let s = Array.isArray(r.servings) ? (r.servings[0] || '') : (r.servings || '')
          const m = s.match(/^\[['"]([^'"]+)/)
          return (m ? m[1] : s).replace(/\s*servings?\s*/i, '').trim()
        })(),
        prep_time: r.prep_time ?? '',
        cook_time: r.cook_time ?? '',
        total_time: r.total_time ?? '',
        cuisine: r.cuisine || '',
        category: r.category || '',
        tags: (r.tags || []).join(', '),
        ingredients: (r.ingredients || []).map(i => typeof i === 'string' ? i : i.text).join('\n'),
        instructions: (r.instructions || []).join('\n'),
        calories: r.calories ?? '',
        protein_g: r.protein_g ?? '',
        carbs_g: r.carbs_g ?? '',
        fat_g: r.fat_g ?? '',
        fiber_g: r.fiber_g ?? '',
        image_url: r.image_url || '',
      }))
      .catch(e => setError(e.message))
  }, [id])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setImageError('')
    try {
      const result = await api.uploadImage(id, file)
      set('image_url', result.image_url)
    } catch (e) {
      setImageError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const num = (v) => v === '' ? null : Number(v)
    try {
      await api.updateRecipe(id, {
        title: form.title,
        description: form.description,
        servings: form.servings,
        prep_time: num(form.prep_time),
        cook_time: num(form.cook_time),
        total_time: num(form.total_time),
        cuisine: form.cuisine,
        category: form.category,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        ingredients: form.ingredients.split('\n').map(l => l.trim()).filter(Boolean),
        instructions: form.instructions.split('\n').map(l => l.trim()).filter(Boolean),
        calories: num(form.calories),
        protein_g: num(form.protein_g),
        carbs_g: num(form.carbs_g),
        fat_g: num(form.fat_g),
        fiber_g: num(form.fiber_g),
        image_url: form.image_url,
      })
      navigate(`/recipes/${id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (error && !form) return <div className="page"><p className="error">{error}</p></div>
  if (!form) return <div className="page"><p className="dim">Loading...</p></div>

  const label = (text) => (
    <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
      {text}
    </label>
  )
  const field = { marginBottom: 20 }
  const section = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 20, marginBottom: 20,
  }

  return (
    <div className="page">
      <button onClick={() => navigate(`/recipes/${id}`)} style={{
        background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
        marginBottom: 16, fontSize: 14,
      }}>← Back</button>

      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Edit Recipe</h1>

      {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

      <form onSubmit={handleSave}>

        {/* Basic info */}
        <div style={section}>
          <div style={field}>{label('Title')}
            <input value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div style={field}>{label('Description')}
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
          </div>
          <div style={{ ...field, marginBottom: 0 }}>{label('Servings')}
            <input value={form.servings} onChange={e => set('servings', e.target.value)} style={{ maxWidth: 160 }} />
          </div>
        </div>

        {/* Timing */}
        <div style={section}>
          <div style={{ display: 'flex', gap: 12 }}>
            {[['prep_time', 'Prep (min)'], ['cook_time', 'Cook (min)'], ['total_time', 'Total (min)']].map(([k, lbl]) => (
              <div key={k} style={{ flex: 1 }}>
                {label(lbl)}
                <input type="number" min="0" value={form[k]} onChange={e => set(k, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* Classification */}
        <div style={section}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>{label('Cuisine')}
              <input value={form.cuisine} onChange={e => set('cuisine', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>{label('Category')}
              <input value={form.category} onChange={e => set('category', e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 0 }}>{label('Tags (comma-separated)')}
            <input value={form.tags} onChange={e => set('tags', e.target.value)} />
          </div>
        </div>

        {/* Photo */}
        <div style={section}>
          {label('Photo')}
          {form.image_url && (
            <img src={form.image_url} alt="Recipe preview"
              style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 10,
                       marginBottom: 12, display: 'block' }} />
          )}
          <input type="text" value={form.image_url} onChange={e => set('image_url', e.target.value)}
            placeholder="Paste an image URL" style={{ marginBottom: 10 }} />
          <label style={{ color: 'var(--accent)', fontSize: 14, cursor: 'pointer', display: 'inline-block' }}>
            {uploading ? 'Uploading...' : '↑ Upload from device'}
            <input type="file" accept="image/*" onChange={handleImageUpload}
              style={{ display: 'none' }} disabled={uploading} />
          </label>
          {imageError && <p className="error" style={{ marginTop: 6, fontSize: 13 }}>{imageError}</p>}
        </div>

        {/* Ingredients */}
        <div style={section}>
          {label('Ingredients (one per line)')}
          <textarea value={form.ingredients} onChange={e => set('ingredients', e.target.value)} rows={8} style={{ marginBottom: 0 }} />
        </div>

        {/* Instructions */}
        <div style={section}>
          {label('Instructions (one step per line)')}
          <textarea value={form.instructions} onChange={e => set('instructions', e.target.value)} rows={10} style={{ marginBottom: 0 }} />
        </div>

        {/* Nutrition */}
        <div style={section}>
          {label('Nutrition')}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['calories','Calories'],['protein_g','Protein (g)'],['carbs_g','Carbs (g)'],
              ['fat_g','Fat (g)'],['fiber_g','Fiber (g)']].map(([k, lbl]) => (
              <div key={k} style={{ flex: '1 1 100px' }}>
                {label(lbl)}
                <input type="number" step="any" min="0" value={form[k]}
                  onChange={e => set(k, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => navigate(`/recipes/${id}`)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}>
            Back
          </button>
        </div>
      </form>
    </div>
  )
}
