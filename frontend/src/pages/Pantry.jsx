import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPantry, addPantryItem, deletePantryItem, patchPantryItem } from '../lib/api';

const CATEGORY_ORDER = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Spices', 'Other'];

const LEVEL_CYCLE = ['full', 'med', 'low', null];
const LEVEL_STYLE = {
  full: { bg: '#14532d', color: '#86efac', border: 'none', label: 'Full' },
  med:  { bg: '#451a03', color: '#fcd34d', border: 'none', label: 'Med'  },
  low:  { bg: '#450a0a', color: '#fca5a5', border: 'none', label: 'Low'  },
};
const LEVEL_UNSET = { bg: 'transparent', color: '#4b5563', border: '1px solid #374151', label: '——' };

function StockControl({ item, onUpdate }) {
  const isQty = item.stock_mode === 'qty';
  const unit = item.category === 'Meat' ? 'lbs' : 'ea';
  const [localQty, setLocalQty] = useState(item.stock_value ?? '');
  const [localFrozen, setLocalFrozen] = useState(item.backup_value ?? '');

  useEffect(() => {
    setLocalQty(item.stock_value ?? '');
  }, [item.stock_value]);

  useEffect(() => {
    setLocalFrozen(item.backup_value ?? '');
  }, [item.backup_value]);

  function cycleLevel(e) {
    if (e) e.preventDefault();
    const idx = LEVEL_CYCLE.indexOf(item.stock_value);
    const delta = e?.type === 'contextmenu' ? -1 : 1;
    const next = LEVEL_CYCLE[((idx + delta) % LEVEL_CYCLE.length + LEVEL_CYCLE.length) % LEVEL_CYCLE.length];
    onUpdate(item.id, { stock_value: next });
  }

  function handleQtyBlur() {
    const val = localQty.trim();
    const num = parseFloat(val);
    onUpdate(item.id, { stock_value: Number.isFinite(num) ? val : null });
  }

  function handleFrozenBlur() {
    const val = localFrozen.trim();
    const num = parseFloat(val);
    onUpdate(item.id, { backup_value: Number.isFinite(num) ? val : null });
  }

  function cycleBackup(e) {
    if (e) e.preventDefault();
    const isSpice = item.category === 'Spices' || item.category === 'Pantry';
    const step = isSpice ? 0.5 : 1;
    const numSteps = isSpice ? 7 : 4; // spices/pantry: 0,0.5,1,...,3 | others: 0,1,2,3
    const current = parseFloat(item.backup_value ?? '0') || 0;
    const idx = Math.round(current / step);
    const delta = e?.type === 'contextmenu' ? -1 : 1;
    const nextIdx = ((idx + delta) % numSteps + numSteps) % numSteps;
    const next = nextIdx * step;
    onUpdate(item.id, { backup_value: next === 0 ? null : String(next) });
  }

  function toggleMode() {
    const newMode = isQty ? 'level' : 'qty';
    onUpdate(item.id, { stock_mode: newMode, stock_value: null, backup_value: null });
  }

  const ls = LEVEL_STYLE[item.stock_value] ?? LEVEL_UNSET;
  const backupCount = parseFloat(item.backup_value ?? '0') || 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {isQty ? (
        <>
          <input
            type="number" min="0" step="0.5"
            value={localQty}
            onChange={e => setLocalQty(e.target.value)}
            onBlur={handleQtyBlur}
            style={{
              width: 52, background: '#1f2937', border: '1px solid #374151',
              borderRadius: 6, padding: '2px 6px', color: '#9ca3af',
              fontSize: 12, textAlign: 'right',
            }}
          />
          <span style={{ fontSize: 11, color: '#6b7280' }}>{unit}</span>
          <span style={{ fontSize: 11, color: '#4b5563' }}>|</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>frz:</span>
          <input
            type="number" min="0" step="0.5"
            value={localFrozen}
            onChange={e => setLocalFrozen(e.target.value)}
            onBlur={handleFrozenBlur}
            placeholder="0"
            style={{
              width: 52, background: '#1f2937', border: '1px dashed #374151',
              borderRadius: 6, padding: '2px 6px', color: '#6b7280',
              fontSize: 12, textAlign: 'right',
            }}
          />
          <span style={{ fontSize: 11, color: '#6b7280' }}>{unit}</span>
        </>
      ) : (
        <>
          <button
            onClick={cycleLevel}
            onContextMenu={cycleLevel}
            title="Left-click: next level · Right-click: previous level"
            style={{
              background: ls.bg, color: ls.color, border: ls.border,
              borderRadius: 99, padding: '2px 8px',
              fontSize: 11, cursor: 'pointer', fontWeight: 500, lineHeight: 1.4,
            }}
          >
            {ls.label}
          </button>
          {backupCount > 0 ? (
            <button
              onClick={cycleBackup}
              onContextMenu={cycleBackup}
              title="Left-click: add backup · Right-click: remove backup"
              style={{
                background: '#1f2937', border: '1px solid #374151', color: '#9ca3af',
                borderRadius: 99, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              }}
            >
              +{backupCount} backup
            </button>
          ) : (
            <button
              onClick={cycleBackup}
              onContextMenu={cycleBackup}
              title="Left-click: add backup · Right-click: remove backup"
              style={{
                background: 'none', border: 'none', color: '#374151',
                fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1,
              }}
            >
              ⊕
            </button>
          )}
        </>
      )}
      <button
        onClick={toggleMode}
        title="Switch stock mode"
        style={{
          background: 'none', border: 'none', color: '#4b5563',
          fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1,
        }}
      >
        ⇄
      </button>
    </div>
  );
}

export default function Pantry() {
  const [items, setItems]         = useState([]);
  const [input, setInput]         = useState('');
  const [initLevel, setInitLevel] = useState(null);
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
    const res = await addPantryItem(name, null, initLevel);
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

  async function handleStockUpdate(id, fields) {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i));
    const result = await patchPantryItem(id, fields);
    if (!result) {
      // Revert on error
      getPantry().then(setItems).catch(() => {});
    }
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
        <select
          value={initLevel ?? ''}
          onChange={e => setInitLevel(e.target.value || null)}
          style={{
            width: 34, flexShrink: 0,
            background: '#1f2937', border: '1px solid #374151',
            borderRadius: 8, padding: '8px 2px', color: '#9ca3af',
            fontSize: 13, cursor: 'pointer', textAlign: 'center',
          }}
        >
          <option value="">—</option>
          {LEVEL_CYCLE.filter(v => v !== null).map(v => (
            <option key={v} value={v}>{LEVEL_STYLE[v].label}</option>
          ))}
        </select>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ color: '#f3f4f6', fontWeight: 500 }}>{item.name}</span>
                  {item.note && (
                    <span style={{
                      background: isAmber(item.note) ? '#451a03' : '#374151',
                      color: isAmber(item.note) ? '#fbbf24' : '#9ca3af',
                      fontSize: 10, padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap',
                    }}>
                      {item.note}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <StockControl item={item} onUpdate={handleStockUpdate} />
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
