# Pantry Stock Levels & On-Hand Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix false-positive on-hand ingredient matching and add per-pantry-item stock level tracking (Full/Med/Low pill or quantity input based on category).

**Architecture:** Word-boundary regex fix in `normalizer.py` resolves false positives. Two new SQLite columns (`stock_mode`, `stock_value`) are added via migration in `pantry.py`. The API route, frontend API helper, and `Pantry.jsx` are updated to carry and display stock data inline on each item row.

**Tech Stack:** Python 3.14 / FastAPI / SQLite / React + Vite (no new dependencies)

---

## File Map

| File | Change |
|------|--------|
| `api/utils/normalizer.py` | Fix `is_on_hand` with `\b` word boundaries; add `detect_stock_mode()` |
| `recipe_extractor/pantry.py` | Migration, expand `add_item`, replace `update_note` → `update_item`, expand `list_items` SELECT |
| `api/routes/pantry.py` | `PatchNoteRequest` → `PatchItemRequest`; call `update_item`; call `detect_stock_mode` on add |
| `frontend/src/lib/api.js` | `patchPantryItem` replaces `patchPantryNote` |
| `frontend/src/pages/Pantry.jsx` | `StockControl` component; `handleStockUpdate` handler; import `patchPantryItem` |
| `tests/test_normalizer.py` | Add false-positive regression tests; add `detect_stock_mode` tests |
| `tests/test_pantry_db.py` | Update import/calls from `update_note` → `update_item`; add stock column tests |
| `tests/test_pantry.py` | Add stock field assertions to existing add test; add patch stock tests |

---

## Task 1: Fix on-hand word-boundary matching

**Files:**
- Modify: `api/utils/normalizer.py`
- Modify: `tests/test_normalizer.py`

- [ ] **Step 1: Add failing regression tests for false positives**

Append to `tests/test_normalizer.py`:

```python
def test_egg_does_not_match_eggplant():
    assert is_on_hand("eggplant", ["egg"]) is False


def test_butter_does_not_match_butternut_squash():
    assert is_on_hand("butternut squash", ["butter"]) is False


def test_butter_matches_peanut_butter():
    # "butter" IS a whole word inside "peanut butter"
    assert is_on_hand("peanut butter", ["butter"]) is True


def test_rice_does_not_match_rice_flour_pantry_item():
    # Existing direction test: "rice flour" in pantry must NOT match ingredient "rice"
    assert is_on_hand("rice", ["rice flour"]) is False
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd "H:/Other/Claude Projects/shiny-enigma/.worktrees/pantry-logger"
python -m pytest tests/test_normalizer.py::test_egg_does_not_match_eggplant tests/test_normalizer.py::test_butter_does_not_match_butternut_squash -v
```

Expected: FAIL — both return `True` currently.

- [ ] **Step 3: Fix `is_on_hand` in `api/utils/normalizer.py`**

Replace the body of `is_on_hand` (lines 41–50). The import `re` is already at the top of the file.

```python
def is_on_hand(ingredient: str, pantry_names: list[str]) -> bool:
    """Return True if any pantry item name appears as a whole word in the normalized ingredient.

    Uses word-boundary matching to prevent partial-word false positives:
    'egg' must not match 'eggplant', 'butter' must not match 'butternut squash'.
    Intentionally one-directional: the pantry item must be contained within the
    ingredient — not the reverse — so 'rice flour' in pantry does not match
    the ingredient 'rice'.
    """
    norm = normalize_ingredient(ingredient)
    return any(
        re.search(r'\b' + re.escape(item.lower()) + r'\b', norm)
        for item in pantry_names
    )
```

- [ ] **Step 4: Run all normalizer tests to confirm green**

```
python -m pytest tests/test_normalizer.py -v
```

Expected: all PASS including the new regression tests.

- [ ] **Step 5: Commit**

```
git add api/utils/normalizer.py tests/test_normalizer.py
git commit -m "fix: use word boundaries in is_on_hand to prevent false positives"
```

---

## Task 2: Add `detect_stock_mode` to normalizer

**Files:**
- Modify: `api/utils/normalizer.py`
- Modify: `tests/test_normalizer.py`

- [ ] **Step 1: Add failing tests for `detect_stock_mode`**

Append to `tests/test_normalizer.py`:

```python
from api.utils.normalizer import normalize_ingredient, detect_category, is_on_hand, detect_stock_mode


def test_produce_gets_qty_mode():
    assert detect_stock_mode("Produce", "apple") == "qty"


def test_meat_gets_qty_mode():
    assert detect_stock_mode("Meat", "chicken") == "qty"


def test_dairy_gets_level_mode():
    assert detect_stock_mode("Dairy", "butter") == "level"


def test_pantry_gets_level_mode():
    assert detect_stock_mode("Pantry", "flour") == "level"


def test_spices_gets_level_mode():
    assert detect_stock_mode("Spices", "cumin") == "level"


def test_other_gets_level_mode():
    assert detect_stock_mode("Other", "xanthan gum") == "level"


def test_egg_exception_gets_qty_despite_dairy():
    assert detect_stock_mode("Dairy", "egg") == "qty"


def test_eggs_exception_plural():
    assert detect_stock_mode("Dairy", "eggs") == "qty"
```

- [ ] **Step 2: Run tests to confirm they fail**

```
python -m pytest tests/test_normalizer.py::test_produce_gets_qty_mode -v
```

Expected: FAIL — `detect_stock_mode` not defined yet.

- [ ] **Step 3: Add `detect_stock_mode` to `api/utils/normalizer.py`**

Add after the `CATEGORY_MAP` dict and before `detect_category`:

```python
_QTY_CATEGORIES: frozenset[str] = frozenset({'Produce', 'Meat'})
_EGG_RE = re.compile(r'\beggs?\b', re.IGNORECASE)


def detect_stock_mode(category: str, name: str) -> str:
    """Return 'qty' for Produce, Meat, and egg items; 'level' for everything else."""
    if _EGG_RE.search(name):
        return 'qty'
    return 'qty' if category in _QTY_CATEGORIES else 'level'
```

- [ ] **Step 4: Run all normalizer tests**

```
python -m pytest tests/test_normalizer.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```
git add api/utils/normalizer.py tests/test_normalizer.py
git commit -m "feat: add detect_stock_mode to normalizer"
```

---

## Task 3: Extend pantry DB layer for stock columns

**Files:**
- Modify: `recipe_extractor/pantry.py`
- Modify: `tests/test_pantry_db.py`

- [ ] **Step 1: Add failing tests for new DB behaviour**

Open `tests/test_pantry_db.py`. The import line currently reads:
```python
from recipe_extractor.pantry import (
    init_pantry_table, add_item, list_items, delete_item, update_note
)
```

Replace the import and add new tests at the end of the file:

```python
from recipe_extractor.pantry import (
    init_pantry_table, add_item, list_items, delete_item, update_item
)


# ... (all existing tests remain unchanged except the two update_note tests below) ...


# Replace test_update_note with:
def test_update_item_note(db):
    item = add_item("flour", "1 bag", "Pantry", "level", db)
    updated = update_item(item["id"], {"note": "running low"}, db)
    assert updated["note"] == "running low"
    assert updated["name"] == "flour"


def test_update_item_stock(db):
    item = add_item("garlic", None, "Produce", "qty", db)
    updated = update_item(item["id"], {"stock_value": "3"}, db)
    assert updated["stock_value"] == "3"
    assert updated["stock_mode"] == "qty"


def test_update_item_nonexistent_returns_none(db):
    init_pantry_table(db)
    assert update_item(9999, {"note": "test"}, db) is None


def test_update_item_empty_fields_returns_none(db):
    item = add_item("salt", None, "Pantry", "level", db)
    assert update_item(item["id"], {}, db) is None


def test_add_item_returns_stock_mode(db):
    item = add_item("chicken", None, "Meat", "qty", db)
    assert item["stock_mode"] == "qty"
    assert item["stock_value"] is None


def test_list_items_includes_stock_columns(db):
    add_item("garlic", None, "Produce", "qty", db)
    items = list_items(db)
    assert "stock_mode" in items[0]
    assert "stock_value" in items[0]


def test_migration_adds_columns_to_existing_table(db):
    """Simulate a pre-migration DB: create table without stock columns, then call init."""
    from recipe_extractor.database import _connect
    with _connect(db) as conn:
        conn.execute("""
            CREATE TABLE pantry_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                note TEXT,
                category TEXT NOT NULL DEFAULT 'Other',
                added_at TEXT NOT NULL
            )
        """)
    # Now call init — it should add the missing columns
    init_pantry_table(db)
    with _connect(db) as conn:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(pantry_items)").fetchall()]
    assert "stock_mode" in cols
    assert "stock_value" in cols
```

- [ ] **Step 2: Run tests to confirm they fail**

```
python -m pytest tests/test_pantry_db.py -v
```

Expected: multiple failures — `update_item` not found, `add_item` signature mismatch, etc.

- [ ] **Step 3: Update `recipe_extractor/pantry.py`**

Replace the entire file content:

```python
"""SQLite persistence layer for pantry items."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from recipe_extractor.database import DB_PATH, _connect


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def init_pantry_table(db_path: Path = DB_PATH) -> None:
    """Create pantry_items table if it doesn't exist, and migrate old schemas."""
    with _connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pantry_items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL UNIQUE,
                note        TEXT,
                category    TEXT    NOT NULL DEFAULT 'Other',
                added_at    TEXT    NOT NULL,
                stock_mode  TEXT    DEFAULT 'level',
                stock_value TEXT
            )
        """)
        if not _column_exists(conn, 'pantry_items', 'stock_mode'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN stock_mode TEXT DEFAULT 'level'")
        if not _column_exists(conn, 'pantry_items', 'stock_value'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN stock_value TEXT")


def add_item(
    name: str,
    note: Optional[str],
    category: str,
    stock_mode: str = 'level',
    db_path: Path = DB_PATH,
) -> dict:
    """Insert a new pantry item. Raises sqlite3.IntegrityError on duplicate name."""
    init_pantry_table(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO pantry_items (name, note, category, added_at, stock_mode) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, note, category, now, stock_mode),
        )
        return {
            "id": cur.lastrowid, "name": name, "note": note,
            "category": category, "added_at": now,
            "stock_mode": stock_mode, "stock_value": None,
        }


def list_items(db_path: Path = DB_PATH) -> list[dict]:
    """Return all pantry items sorted by category then name."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, note, category, added_at, stock_mode, stock_value "
            "FROM pantry_items ORDER BY category, name COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_item(item_id: int, db_path: Path = DB_PATH) -> bool:
    """Delete a pantry item by id. Returns True if a row was deleted."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM pantry_items WHERE id = ?", (item_id,))
    return cur.rowcount > 0


def update_item(
    item_id: int,
    fields: dict,
    db_path: Path = DB_PATH,
) -> Optional[dict]:
    """Update allowed fields (note, stock_mode, stock_value) on a pantry item.

    Returns the updated item dict, or None if the item doesn't exist or fields is empty.
    """
    allowed = {'note', 'stock_mode', 'stock_value'}
    valid = {k: v for k, v in fields.items() if k in allowed}
    if not valid:
        return None
    init_pantry_table(db_path)
    set_clause = ', '.join(f"{k} = ?" for k in valid)
    values = list(valid.values()) + [item_id]
    with _connect(db_path) as conn:
        cur = conn.execute(
            f"UPDATE pantry_items SET {set_clause} WHERE id = ?", values
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, name, note, category, added_at, stock_mode, stock_value "
            "FROM pantry_items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return dict(row)
```

- [ ] **Step 4: Remove the old `test_update_note` and `test_update_note_nonexistent_returns_none` tests from `tests/test_pantry_db.py`**

These two tests still reference `update_note` (which no longer exists) and were replaced with `test_update_item_note` and `test_update_item_nonexistent_returns_none` in Step 1. Delete them now:

```python
# DELETE these two functions from tests/test_pantry_db.py:

def test_update_note(db):
    item = add_item("flour", "1 bag", "Pantry", db)
    updated = update_note(item["id"], "running low", db)
    assert updated["note"] == "running low"
    assert updated["name"] == "flour"


def test_update_note_nonexistent_returns_none(db):
    init_pantry_table(db)
    assert update_note(9999, "test", db) is None
```

Also update `test_add_and_list` to pass the new `stock_mode` argument:

```python
def test_add_and_list(db):
    item = add_item("garlic", "1 bulb", "Produce", "qty", db)
    assert item["name"] == "garlic"
    assert item["category"] == "Produce"
    assert item["note"] == "1 bulb"
    assert "id" in item

    items = list_items(db)
    assert len(items) == 1
    assert items[0]["name"] == "garlic"


def test_add_duplicate_raises(db):
    import sqlite3
    add_item("garlic", None, "Produce", "qty", db)
    with pytest.raises(sqlite3.IntegrityError):
        add_item("garlic", None, "Produce", "qty", db)


def test_list_sorted_by_category_then_name(db):
    add_item("zucchini", None, "Produce", "qty", db)
    add_item("butter", None, "Dairy", "level", db)
    add_item("apple", None, "Produce", "qty", db)
    items = list_items(db)
    names = [i["name"] for i in items]
    assert names == ["butter", "apple", "zucchini"]


def test_delete_item(db):
    item = add_item("salt", None, "Pantry", "level", db)
    assert delete_item(item["id"], db) is True
    assert list_items(db) == []


def test_delete_nonexistent_returns_false(db):
    init_pantry_table(db)
    assert delete_item(9999, db) is False
```

- [ ] **Step 5: Run pantry DB tests**

```
python -m pytest tests/test_pantry_db.py -v
```

Expected: all PASS.

- [ ] **Step 6: Run full suite to check for regressions**

```
python -m pytest tests/ -v
```

Expected: all PASS (the `test_pantry.py` integration tests still use `update_note` via the HTTP API — we haven't changed the route yet, so they should still pass against the old route shape).

- [ ] **Step 7: Commit**

```
git add recipe_extractor/pantry.py tests/test_pantry_db.py
git commit -m "feat: add stock_mode/stock_value columns to pantry DB layer"
```

---

## Task 4: Update pantry API route and frontend helper

**Files:**
- Modify: `api/routes/pantry.py`
- Modify: `frontend/src/lib/api.js`
- Modify: `tests/test_pantry.py`

- [ ] **Step 1: Add failing tests for new API behaviour**

Add to the end of `tests/test_pantry.py`:

```python
def test_add_item_returns_stock_fields(client):
    r = client.post("/api/pantry", json={"name": "garlic"})
    assert r.status_code == 201
    data = r.json()
    assert data["stock_mode"] == "qty"   # Produce → qty
    assert data["stock_value"] is None


def test_add_meat_gets_qty_mode(client):
    r = client.post("/api/pantry", json={"name": "chicken"})
    assert r.status_code == 201
    assert r.json()["stock_mode"] == "qty"


def test_add_pantry_item_gets_level_mode(client):
    r = client.post("/api/pantry", json={"name": "flour"})
    assert r.status_code == 201
    assert r.json()["stock_mode"] == "level"


def test_patch_stock_value(client):
    add = client.post("/api/pantry", json={"name": "garlic"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"stock_value": "3"})
    assert r.status_code == 200
    assert r.json()["stock_value"] == "3"


def test_patch_stock_mode(client):
    add = client.post("/api/pantry", json={"name": "flour"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"stock_mode": "qty", "stock_value": None})
    assert r.status_code == 200
    assert r.json()["stock_mode"] == "qty"
    assert r.json()["stock_value"] is None


def test_patch_empty_body_returns_422(client):
    add = client.post("/api/pantry", json={"name": "salt"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={})
    assert r.status_code == 422
```

- [ ] **Step 2: Run new tests to confirm they fail**

```
python -m pytest tests/test_pantry.py::test_add_item_returns_stock_fields tests/test_pantry.py::test_patch_stock_value -v
```

Expected: FAIL.

- [ ] **Step 3: Update `api/routes/pantry.py`**

Replace the entire file:

```python
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.pantry import add_item, list_items, delete_item, update_item
from api.utils.normalizer import normalize_ingredient, detect_category, detect_stock_mode

router = APIRouter()


class AddItemRequest(BaseModel):
    name: str
    note: Optional[str] = None


class PatchItemRequest(BaseModel):
    note: Optional[str] = None
    stock_mode: Optional[str] = None
    stock_value: Optional[str] = None


@router.get("/pantry")
def api_list_pantry(db: Path = Depends(get_db_path)):
    return list_items(db_path=db)


@router.post("/pantry", status_code=201)
def api_add_pantry_item(body: AddItemRequest, db: Path = Depends(get_db_path)):
    name = normalize_ingredient(body.name)
    if not name:
        raise HTTPException(status_code=422, detail="Please enter an ingredient name")
    category = detect_category(name)
    stock_mode = detect_stock_mode(category, name)
    try:
        return add_item(name, body.note, category, stock_mode, db_path=db)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail=f"'{name}' is already in your pantry")


@router.delete("/pantry/{item_id}", status_code=204)
def api_delete_pantry_item(item_id: int, db: Path = Depends(get_db_path)):
    if not delete_item(item_id, db_path=db):
        raise HTTPException(status_code=404, detail="Item not found")


@router.patch("/pantry/{item_id}")
def api_patch_pantry_item(item_id: int, body: PatchItemRequest, db: Path = Depends(get_db_path)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update")
    updated = update_item(item_id, fields, db_path=db)
    if updated is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated
```

- [ ] **Step 4: Update `frontend/src/lib/api.js`**

Replace the three pantry exports at the bottom of the file:

```javascript
// Pantry
export const getPantry  = ()            => fetch('/api/pantry').then(r => r.json()).catch(() => []);
export const addPantryItem = (name, note) =>
  fetch('/api/pantry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, note: note || undefined }),
  }).catch(() => null);
export const deletePantryItem = (id) =>
  fetch(`/api/pantry/${id}`, { method: 'DELETE' }).catch(() => null);
export const patchPantryItem = (id, fields) =>
  fetch(`/api/pantry/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  }).then(r => r.json()).catch(() => null);
```

- [ ] **Step 5: Run all tests**

```
python -m pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```
git add api/routes/pantry.py frontend/src/lib/api.js tests/test_pantry.py
git commit -m "feat: update pantry route and api.js for stock level support"
```

---

## Task 5: Stock level UI on Pantry rows

**Files:**
- Modify: `frontend/src/pages/Pantry.jsx`

No automated tests for the frontend — verify manually by running the dev server.

- [ ] **Step 1: Update the import line in `Pantry.jsx`**

Replace:
```javascript
import { getPantry, addPantryItem, deletePantryItem } from '../lib/api';
```
With:
```javascript
import { getPantry, addPantryItem, deletePantryItem, patchPantryItem } from '../lib/api';
```

- [ ] **Step 2: Add `StockControl` component above the `Pantry` default export**

Add this block immediately before `export default function Pantry()`:

```javascript
const LEVEL_CYCLE = ['full', 'med', 'low', null];
const LEVEL_STYLE = {
  full: { bg: '#14532d', color: '#86efac', border: 'none',                  label: 'Full' },
  med:  { bg: '#451a03', color: '#fcd34d', border: 'none',                  label: 'Med'  },
  low:  { bg: '#450a0a', color: '#fca5a5', border: 'none',                  label: 'Low'  },
  null: { bg: 'transparent', color: '#4b5563', border: '1px solid #374151', label: '——'   },
};

function StockControl({ item, onUpdate }) {
  const isQty = item.stock_mode === 'qty';
  const unit = item.category === 'Meat' ? 'lbs' : 'ea';
  const [localQty, setLocalQty] = useState(item.stock_value ?? '');

  useEffect(() => {
    setLocalQty(item.stock_value ?? '');
  }, [item.stock_value]);

  function cycleLevel() {
    const idx = LEVEL_CYCLE.indexOf(item.stock_value);
    const next = LEVEL_CYCLE[(idx + 1) % LEVEL_CYCLE.length];
    onUpdate(item.id, { stock_value: next });
  }

  function handleQtyBlur() {
    const val = localQty.trim();
    onUpdate(item.id, { stock_value: val || null });
  }

  function toggleMode() {
    const newMode = isQty ? 'level' : 'qty';
    onUpdate(item.id, { stock_mode: newMode, stock_value: null });
  }

  const ls = LEVEL_STYLE[item.stock_value] ?? LEVEL_STYLE[null];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {isQty ? (
        <>
          <input
            type="number"
            min="0"
            step="0.5"
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
        </>
      ) : (
        <button
          onClick={cycleLevel}
          style={{
            background: ls.bg, color: ls.color, border: ls.border,
            borderRadius: 99, padding: '2px 8px',
            fontSize: 11, cursor: 'pointer', fontWeight: 500, lineHeight: 1.4,
          }}
        >
          {ls.label}
        </button>
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
```

- [ ] **Step 3: Add `handleStockUpdate` inside the `Pantry` component**

Add this function after `handleDelete` (around line 68):

```javascript
async function handleStockUpdate(id, fields) {
  // Optimistic update
  setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i));
  const result = await patchPantryItem(id, fields);
  if (!result) {
    // Revert on error
    getPantry().then(setItems).catch(() => {});
  }
}
```

- [ ] **Step 4: Update the item row in the JSX to include `StockControl`**

Find the item row `<div>` (currently around line 144–170). Replace the inner content:

```jsx
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
```

- [ ] **Step 5: Manual verification**

Start the dev server and verify:
1. Pantry items added as Produce/Meat show a number input + unit label
2. Pantry items added as Pantry/Spices/Dairy/Other show the cycling pill (——→Full→Med→Low→——)
3. Clicking `⇄` switches mode and clears the value
4. Qty values persist after blurring the input
5. Level pill color changes (green/amber/red/gray outline)

- [ ] **Step 6: Commit**

```
git add frontend/src/pages/Pantry.jsx
git commit -m "feat: add stock level controls to pantry item rows"
```

---

## Task 6: Build frontend dist and final verification

The dev server serves the Vite dev build, but the app is ultimately served as a pre-built `frontend/dist/`. Build it now so the dist stays in sync.

- [ ] **Step 1: Build the frontend**

```
cd "H:/Other/Claude Projects/shiny-enigma/.worktrees/pantry-logger/frontend"
npm run build
cd ..
```

- [ ] **Step 2: Run full test suite one final time**

```
python -m pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 3: Commit the built dist**

```
git add frontend/dist frontend/src/pages/Pantry.jsx
git commit -m "chore: rebuild frontend dist with stock level UI"
```
