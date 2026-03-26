const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 409) {
      const err = new Error('duplicate')
      err.existing = body.detail
      throw err
    }
    throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

function buildQuery(q, filters = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (filters.cuisine) params.set('cuisine', filters.cuisine)
  if (filters.category) params.set('category', filters.category)
  if (filters.max_time) params.set('max_time', String(filters.max_time))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export const api = {
  listRecipes: (q, filters, signal) =>
    request(`/recipes${buildQuery(q, filters)}`, signal ? { signal } : {}),
  addRecipe: (url) => request('/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }),
  getRecipe: (id) => request(`/recipes/${id}`),
  updateRecipe: (id, data) => request(`/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: 'DELETE' }),
  uploadImage: (id, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request(`/recipes/${id}/image`, { method: 'POST', body: fd })
  },
  getStats: () => request('/stats'),
  exportUrl: () => `${BASE}/export`,
}
