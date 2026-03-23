const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  listRecipes: (q, signal) => request(`/recipes${q ? `?q=${encodeURIComponent(q)}` : ''}`, signal ? { signal } : {}),
  addRecipe: (url) => request('/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }),
  getRecipe: (id) => request(`/recipes/${id}`),
  deleteRecipe: (id) => request(`/recipes/${id}`, { method: 'DELETE' }),
  getStats: () => request('/stats'),
  exportUrl: () => `${BASE}/export`,
}
