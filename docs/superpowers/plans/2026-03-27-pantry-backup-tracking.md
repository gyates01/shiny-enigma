# Pantry Backup Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `backup_value` field to pantry items so users can track backup bottles (level-mode) and frozen reserves (qty-mode), surfaced on both the Pantry page and recipe ingredient lists.

**Architecture:** One new SQLite column (`backup_value TEXT`) on `pantry_items` propagates through the DB layer → pantry API → recipe ingredient API → two frontend components. The existing `stock_mode` governs how `backup_value` is interpreted (count for level, lbs for qty). A new `find_pantry_match` helper in the normalizer replaces the boolean `is_on_hand` call in recipe GET routes so full pantry item data (including `backup_value`) can be returned per ingredient.

**Tech Stack:** Python 3.12, FastAPI, SQLite, Pydantic v2, React 18, Vite

---

### Task 1: DB layer — add backup_value column

**Files:**
- Modify: `recipe_extractor/pantry.py`
- Test: `tests/test_pantry_db.py`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `tests/test_pantry_db.py`:

```python
def test_add_item_returns_backup_value_none(db):
    item = add_item("soy sauce", None, "Pantry", "level", db)
    assert "backup_value" in item
    assert item["backup_value"] is None


def test_list_items_includes_backup_value(db):
    add_item("soy sauce", None, "Pantry", "level", db)
    items = list_items(db)
    assert "backup_value" in items[0]
    assert items[0]["backup_value"] is None


def test_update_item_backup_value(db):
    item = add_item("soy sauce", None, "Pantry", "level", db)
    updated = update_item(item["id"], {"backup_value": "2"}, db)
    assert updated["backup_value"] == "2"


def test_update_item_backup_value_clear(db):
    item = add_item("soy sauce", None, "Pantry", "level", db)
    update_item(item["id"], {"backup_value": "1"}, db)
    updated = update_item(item["id"], {"backup_value": None}, db)
    assert updated["backup_value"] is None


def test_migration_adds_backup_value_column(db):
    """Simulate a DB that has stock_mode/stock_value but not backup_value."""
    from recipe_extractor.database import _connect
    with _connect(db) as conn:
        conn.execute("""
            CREATE TABLE pantry_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                note TEXT,
                category TEXT NOT NULL DEFAULT 'Other',
                added_at TEXT NOT NULL,
                stock_mode TEXT DEFAULT 'level',
                stock_value TEXT
            )
        """)
    init_pantry_table(db)
    with _connect(db) as conn:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(pantry_items)").fetchall()]
    assert "backup_value" in cols
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_pantry_db.py::test_add_item_returns_backup_value_none tests/test_pantry_db.py::test_list_items_includes_backup_value tests/test_pantry_db.py::test_update_item_backup_value tests/test_pantry_db.py::test_update_item_backup_value_clear tests/test_pantry_db.py::test_migration_adds_backup_value_column -v
```

Expected: all 5 FAIL (KeyError or AssertionError).

- [ ] **Step 3: Implement the changes in pantry.py**

Replace the full content of `recipe_extractor/pantry.py` with:

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
                stock_value TEXT,
                backup_value TEXT
            )
        """)
        if not _column_exists(conn, 'pantry_items', 'stock_mode'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN stock_mode TEXT DEFAULT 'level'")
        if not _column_exists(conn, 'pantry_items', 'stock_value'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN stock_value TEXT")
        if not _column_exists(conn, 'pantry_items', 'backup_value'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN backup_value TEXT")


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
            "stock_mode": stock_mode, "stock_value": None, "backup_value": None,
        }


def list_items(db_path: Path = DB_PATH) -> list[dict]:
    """Return all pantry items sorted by category then name."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, note, category, added_at, stock_mode, stock_value, backup_value "
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
    """Update allowed fields on a pantry item.

    Returns the updated item dict, or None if the item doesn't exist or fields is empty.
    """
    allowed = {'note', 'stock_mode', 'stock_value', 'backup_value'}
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
            "SELECT id, name, note, category, added_at, stock_mode, stock_value, backup_value "
            "FROM pantry_items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return dict(row)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_pantry_db.py -v
```

Expected: all tests PASS (including the 5 new ones and all existing ones).

- [ ] **Step 5: Commit**

```bash
git add recipe_extractor/pantry.py tests/test_pantry_db.py
git commit -m "feat: add backup_value column to pantry_items DB layer"
```

---

### Task 2: Normalizer — add find_pantry_match helper

**Files:**
- Modify: `api/utils/normalizer.py`
- Test: `tests/test_normalizer.py`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `tests/test_normalizer.py`:

```python
from api.utils.normalizer import find_pantry_match


def test_find_pantry_match_returns_matching_item():
    items = [
        {"name": "garlic", "stock_mode": "qty", "stock_value": "3", "backup_value": None},
        {"name": "flour",  "stock_mode": "level", "stock_value": "full", "backup_value": "1"},
    ]
    result = find_pantry_match("3 cloves garlic, minced", items)
    assert result is not None
    assert result["name"] == "garlic"


def test_find_pantry_match_returns_none_when_not_found():
    items = [{"name": "garlic", "stock_mode": "qty", "stock_value": None, "backup_value": None}]
    assert find_pantry_match("1 cup flour", items) is None


def test_find_pantry_match_uses_word_boundary():
    items = [{"name": "egg", "stock_mode": "qty", "stock_value": "6", "backup_value": None}]
    assert find_pantry_match("1 eggplant", items) is None


def test_find_pantry_match_returns_full_item_dict():
    items = [{"name": "soy sauce", "stock_mode": "level", "stock_value": "low", "backup_value": "2"}]
    result = find_pantry_match("3 tbsp soy sauce", items)
    assert result["backup_value"] == "2"
    assert result["stock_value"] == "low"


def test_find_pantry_match_empty_pantry():
    assert find_pantry_match("garlic", []) is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_normalizer.py::test_find_pantry_match_returns_matching_item tests/test_normalizer.py::test_find_pantry_match_returns_none_when_not_found tests/test_normalizer.py::test_find_pantry_match_uses_word_boundary tests/test_normalizer.py::test_find_pantry_match_returns_full_item_dict tests/test_normalizer.py::test_find_pantry_match_empty_pantry -v
```

Expected: all 5 FAIL with ImportError or AttributeError.

- [ ] **Step 3: Add find_pantry_match to normalizer.py**

Add the following function after `is_on_hand` in `api/utils/normalizer.py` (after line 54, before the `CATEGORY_MAP` comment):

```python
def find_pantry_match(ing_text: str, pantry_items: list[dict]) -> dict | None:
    """Return the first pantry item whose name matches ing_text (word-boundary), or None.

    Uses the same word-boundary logic as is_on_hand. Returns the full item dict
    so callers can access stock_mode, stock_value, backup_value, etc.
    """
    norm = normalize_ingredient(ing_text)
    for item in pantry_items:
        if re.search(r'\b' + re.escape(item['name'].lower()) + r'\b', norm):
            return item
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_normalizer.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/utils/normalizer.py tests/test_normalizer.py
git commit -m "feat: add find_pantry_match helper to normalizer"
```

---

### Task 3: Pantry API route — expose backup_value in PATCH

**Files:**
- Modify: `api/routes/pantry.py`
- Test: `tests/test_pantry.py`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `tests/test_pantry.py`:

```python
def test_add_item_returns_backup_value_field(client):
    r = client.post("/api/pantry", json={"name": "soy sauce"})
    assert r.status_code == 201
    assert "backup_value" in r.json()
    assert r.json()["backup_value"] is None


def test_patch_backup_value(client):
    add = client.post("/api/pantry", json={"name": "soy sauce"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"backup_value": "2"})
    assert r.status_code == 200
    assert r.json()["backup_value"] == "2"


def test_patch_backup_value_clear(client):
    add = client.post("/api/pantry", json={"name": "soy sauce"})
    item_id = add.json()["id"]
    client.patch(f"/api/pantry/{item_id}", json={"backup_value": "1"})
    r = client.patch(f"/api/pantry/{item_id}", json={"backup_value": None})
    assert r.status_code == 200
    assert r.json()["backup_value"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_pantry.py::test_add_item_returns_backup_value_field tests/test_pantry.py::test_patch_backup_value tests/test_pantry.py::test_patch_backup_value_clear -v
```

Expected: all 3 FAIL.

- [ ] **Step 3: Update PatchItemRequest in api/routes/pantry.py**

Change the `PatchItemRequest` class from:

```python
class PatchItemRequest(BaseModel):
    note: Optional[str] = None
    stock_mode: Optional[Literal['level', 'qty']] = None
    stock_value: Optional[str] = None
```

To:

```python
class PatchItemRequest(BaseModel):
    note: Optional[str] = None
    stock_mode: Optional[Literal['level', 'qty']] = None
    stock_value: Optional[str] = None
    backup_value: Optional[str] = None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_pantry.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/routes/pantry.py tests/test_pantry.py
git commit -m "feat: expose backup_value in pantry PATCH route"
```

---

### Task 4: Recipe routes — enrich ingredient objects with stock data

**Files:**
- Modify: `api/routes/recipes.py`
- Test: `tests/test_recipes.py`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `tests/test_recipes.py`. First find the `_recipe` fixture or helper already used in the file:

```bash
grep -n "def.*recipe\|source_url\|SAMPLE" tests/test_recipes.py | head -20
```

Then add these tests (use the same `save_recipe` + `client` pattern already in the file):

```python
def test_get_recipe_ingredients_have_backup_fields(client, tmp_db):
    from recipe_extractor.database import save_recipe
    save_recipe({
        "title": "Test", "source_url": "http://example.com/backup-test",
        "ingredients": ["3 tbsp soy sauce"], "instructions": [],
        "cuisine": "", "category": "",
    }, db_path=tmp_db)
    recipes = client.get("/api/recipes").json()
    recipe_id = recipes[0]["id"]
    r = client.get(f"/api/recipes/{recipe_id}")
    assert r.status_code == 200
    ing = r.json()["ingredients"][0]
    assert "stock_mode" in ing
    assert "stock_value" in ing
    assert "backup_value" in ing
    # No pantry items — all None
    assert ing["stock_mode"] is None
    assert ing["backup_value"] is None


def test_get_recipe_on_hand_ingredient_shows_backup_value(client, tmp_db):
    from recipe_extractor.database import save_recipe
    save_recipe({
        "title": "Test", "source_url": "http://example.com/backup-test2",
        "ingredients": ["3 tbsp soy sauce"], "instructions": [],
        "cuisine": "", "category": "",
    }, db_path=tmp_db)
    # Add soy sauce to pantry with a backup
    add_r = client.post("/api/pantry", json={"name": "soy sauce"})
    item_id = add_r.json()["id"]
    client.patch(f"/api/pantry/{item_id}", json={"stock_value": "low", "backup_value": "1"})

    recipes = client.get("/api/recipes").json()
    recipe_id = recipes[0]["id"]
    r = client.get(f"/api/recipes/{recipe_id}")
    ing = r.json()["ingredients"][0]
    assert ing["on_hand"] is True
    assert ing["stock_value"] == "low"
    assert ing["backup_value"] == "1"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_recipes.py::test_get_recipe_ingredients_have_backup_fields tests/test_recipes.py::test_get_recipe_on_hand_ingredient_shows_backup_value -v
```

Expected: both FAIL (KeyError on `stock_mode`).

- [ ] **Step 3: Update api/routes/recipes.py**

Change the import at the top from:

```python
from api.utils.normalizer import is_on_hand
```

To:

```python
from api.utils.normalizer import is_on_hand, find_pantry_match
```

Then update the three recipe endpoints that annotate ingredients. The pattern appears in `api_add_recipe` (line ~96), `api_get_recipe` (line ~109), and `api_update_recipe` (line ~130).

In each location, replace the two-line pattern:

```python
pantry_names = [item["name"] for item in list_items(db_path=db)]
saved["ingredients"] = [
    {"text": ing, "on_hand": is_on_hand(ing, pantry_names)}
    for ing in saved["ingredients"]
]
```

with:

```python
pantry_items = list_items(db_path=db)
saved["ingredients"] = [
    _annotate_ingredient(ing, pantry_items)
    for ing in saved["ingredients"]
]
```

And for `api_get_recipe` and `api_update_recipe`, the variable is `recipe` not `saved`:

```python
pantry_items = list_items(db_path=db)
recipe["ingredients"] = [
    _annotate_ingredient(ing, pantry_items)
    for ing in recipe["ingredients"]
]
```

Add a module-level helper function after the `router = APIRouter()` line:

```python
def _annotate_ingredient(ing_text: str, pantry_items: list[dict]) -> dict:
    """Annotate a raw ingredient string with on_hand status and stock data."""
    match = find_pantry_match(ing_text, pantry_items)
    return {
        "text": ing_text,
        "on_hand": match is not None,
        "stock_mode": match["stock_mode"] if match else None,
        "stock_value": match["stock_value"] if match else None,
        "backup_value": match["backup_value"] if match else None,
    }
```

Note: `api_list_recipes` uses `is_on_hand` for the `makeable` boolean check and does **not** return ingredient objects — leave it unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_recipes.py -v
```

Expected: all tests PASS, including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add api/routes/recipes.py tests/test_recipes.py
git commit -m "feat: enrich recipe ingredient objects with stock and backup data"
```

---

### Task 5: Frontend Pantry — backup controls in StockControl

**Files:**
- Modify: `frontend/src/pages/Pantry.jsx`

No automated tests for frontend — verify manually after implementation.

- [ ] **Step 1: Update the StockControl component**

Replace the entire `StockControl` function in `frontend/src/pages/Pantry.jsx` with:

```jsx
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

  function cycleLevel() {
    const idx = LEVEL_CYCLE.indexOf(item.stock_value);
    const next = LEVEL_CYCLE[(idx + 1) % LEVEL_CYCLE.length];
    onUpdate(item.id, { stock_value: next });
  }

  function handleQtyBlur() {
    const val = localQty.trim();
    onUpdate(item.id, { stock_value: val || null });
  }

  function handleFrozenBlur() {
    const val = localFrozen.trim();
    onUpdate(item.id, { backup_value: val || null });
  }

  function cycleBackup() {
    const current = parseInt(item.backup_value ?? '0', 10) || 0;
    const next = (current + 1) % 4; // 0,1,2,3 then wraps to 0
    onUpdate(item.id, { backup_value: next === 0 ? null : String(next) });
  }

  function toggleMode() {
    const newMode = isQty ? 'level' : 'qty';
    onUpdate(item.id, { stock_mode: newMode, stock_value: null, backup_value: null });
  }

  const ls = LEVEL_STYLE[item.stock_value] ?? LEVEL_UNSET;
  const backupCount = parseInt(item.backup_value ?? '0', 10) || 0;

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
              title="Click to cycle backup count (wraps to 0)"
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
              title="Add a backup unit"
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
```

- [ ] **Step 2: Manually verify in browser**

Start the dev server with `start.bat`. Open `http://localhost:5173/pantry`.

For a level-mode item (e.g. soy sauce):
- Confirm the `⊕` icon appears to the right of the level pill
- Click `⊕` → badge changes to `+1 backup`
- Click `+1 backup` → `+2 backup`
- Click again → `+3 backup`
- Click again → back to `⊕`

For a qty-mode item (e.g. chicken):
- Confirm two inputs appear: `[ready input] lbs | frz: [frozen input] lbs`
- Enter a value in the frozen input, tab away → value persists on reload

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Pantry.jsx
git commit -m "feat: add backup controls to StockControl (level badge + qty frozen input)"
```

---

### Task 6: Frontend RecipeDetail — backup badge on on-hand ingredients

**Files:**
- Modify: `frontend/src/pages/RecipeDetail.jsx`

- [ ] **Step 1: Add the backup badge to the on-hand ingredient row**

Find the "On hand" ingredients section in `frontend/src/pages/RecipeDetail.jsx`. The current on-hand row looks like:

```jsx
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
    fontSize: 14,
    color: checked[i] ? '#555' : '#f3f4f6',
    textDecoration: checked[i] ? 'line-through' : 'none',
  }}>
    {imperial ? toImperial(ing.text) : ing.text}
  </span>
</div>
```

Replace it with (adding `flex: 1` to the text span and a backup badge after it):

```jsx
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
```

- [ ] **Step 2: Manually verify in browser**

Open a recipe that contains an ingredient you have in your pantry. Go to `/pantry`, set a backup count on a level-mode item or a frozen amount on a qty item. Then reload the recipe page and confirm the backup badge appears on the matching "On hand" ingredient.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RecipeDetail.jsx
git commit -m "feat: show backup badge on on-hand ingredients in recipe detail"
```

---

### Task 7: Rebuild frontend dist

**Files:**
- Modify: `frontend/dist/`

- [ ] **Step 1: Build**

```bash
cd frontend && npm run build
```

Expected output ends with: `✓ built in NNNms`

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/dist
git commit -m "chore: rebuild frontend dist for backup tracking feature"
```

---

### Task 8: Run full test suite

- [ ] **Step 1: Run all backend tests**

```bash
pytest -v
```

Expected: all tests PASS, no failures.

- [ ] **Step 2: Confirm no regressions**

If any test fails, fix the issue before continuing. Do not skip or delete failing tests.
