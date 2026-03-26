import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPantry, addPantryItem, deletePantryItem } from '../lib/api';

const CATEGORY_ORDER = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Spices', 'Other'];

export default function Pantry() {
  const [items, setItems]         = useState([]);
  const [input, setInput]         = useState('');
  const [search, setSearch]       = useState('');
  const [error, setError]         = useState('');
  const [makeableCount, setMakeableCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    getPantry().then(setItems).catch(() => {});
    // Fetch makeable count
    fetch('/api/recipes?makeable=true')
      .then(r => r.json())
      .then(rs => setMakeableCount(rs.length))
      .catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const filtered = search
      ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
      : items;
    return CATEGORY_ORDER
      .map(cat => ({ cat, list: filtered.filter(i => i.category === cat) }))
      .filter(g => g.list.length > 0);
  }, [items, search]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const name = input.trim();
    if (!name) return;
    const res = await addPantryItem(name, null);
    if (!res) {
      setError('Something went wrong. Please try again.');
      return;
    }
    if (res.status === 409) {
      setError(`"${name}" is already in your pantry`);
      return;
    }
    if (res.status === 422) {
      setError('Please enter an ingredient name');
      return;
    }
    if (!res.ok) {
      setError('Something went wrong. Please try again.');
      return;
    }
    const item = await res.json();
    setItems(prev => [...prev, item].sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    ));
    setInput('');
    // Refresh makeable count
    fetch('/api/recipes?makeable=true').then(r => r.json()).then(rs => setMakeableCount(rs.length)).catch(() => {});
  }

  async function handleDelete(id) {
    await deletePantryItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
    fetch('/api/recipes?makeable=true').then(r => r.json()).then(rs => setMakeableCount(rs.length)).catch(() => {});
  }

  const isAmber = (note) => note && /low|out/i.test(note);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', fontFamily: 'system-ui, sans-serif', color: '#f3f4f6' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#fff' }}>Pantry</h1>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{items.length} items</span>
      </div>

      {/* Quick-add */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setError(''); }}
          placeholder="Add item (e.g. flour, garlic...)"
          style={{
            flex: 1, background: '#1f2937', border: '1px solid #374151',
            borderRadius: 8, padding: '8px 12px', color: '#f3f4f6', fontSize: 14,
          }}
        />
        <button
          type="submit"
          style={{
            background: '#6366f1', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer',
          }}
        >
          Add
        </button>
      </form>
      {error && <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}

      {/* Makeable banner */}
      {makeableCount > 0 && (
        <div
          onClick={() => navigate('/recipes?makeable=true')}
          style={{
            background: '#064e3b', border: '1px solid #065f46', borderRadius: 8,
            padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#6ee7b7',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <span>You can make <strong>{makeableCount} recipe{makeableCount !== 1 ? 's' : ''}</strong> with what you have</span>
          <span style={{ textDecoration: 'underline', fontSize: 12 }}>See all →</span>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search pantry..."
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#1f2937', border: '1px solid #374151',
          borderRadius: 8, padding: '8px 12px', color: '#f3f4f6',
          fontSize: 14, marginBottom: 16,
        }}
      />

      {/* Grouped items */}
      {grouped.length === 0 && items.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Add your first ingredient above to get started.
        </p>
      )}
      {grouped.map(({ cat, list }) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>
            {cat}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {list.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 12px', background: '#1f2937', borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#f3f4f6', fontWeight: 500 }}>{item.name}</span>
                  {item.note && (
                    <span style={{
                      background: isAmber(item.note) ? '#451a03' : '#374151',
                      color: isAmber(item.note) ? '#fbbf24' : '#9ca3af',
                      fontSize: 10, padding: '2px 7px', borderRadius: 99,
                    }}>
                      {item.note}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
