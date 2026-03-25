# Pantry Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pantry inventory tracking so users can see which ingredients they already have when browsing and viewing recipes.

**Architecture:** New `pantry_items` table in `recipes.db`; a regex-based normalizer strips quantities, units, and prep notes from recipe ingredient strings before substring matching against pantry names; four new pantry REST endpoints; recipe detail endpoint enhanced to return `on_hand: bool` per ingredient; new Pantry page in React with category groups and a "makeable" banner.

**Prerequisite:** The web UI plan (`docs/superpowers/plans/2026-03-22-web-ui.md`) must be executed first. This plan assumes `api/routes/recipes.py`, `api/main.py`, `frontend/src/pages/RecipeDetail.jsx`, `frontend/src/App.jsx`, and `frontend/src/components/Nav.jsx` already exist.

**Tech Stack:** Python 3.x, FastAPI, SQLite (via `recipe_extractor.database._connect`), pytest + httpx, React 18, Vite

---

## File Map

**Create:**
- `recipe_extractor/pantry.py` — DB functions: `init_pantry_table`, `add_item`, `list_items`, `delete_item`, `update_note`
- `api/utils/__init__.py` — empty package marker
- `api/utils/normalizer.py` — `normalize_ingredient()`, `detect_category()`, `is_on_hand()`
- `api/routes/pantry.py` — GET / POST / DELETE / PATCH `/api/pantry`
- `tests/test_pantry_db.py` — unit tests for DB layer (no HTTP)
- `tests/test_normalizer.py` — unit tests for normalization logic
- `tests/test_pantry.py` — HTTP tests for pantry endpoints
- `tests/test_pantry_integration.py` — HTTP tests for on_hand / makeable
- `frontend/src/pages/Pantry.jsx` — pantry management page

**Modify:**
- `api/main.py` — register `pantry.router`
- `api/routes/recipes.py` — add `on_hand` to ingredient objects in detail; add `makeable` + `?makeable=true` filter to list
- `tests/test_recipes.py` — update `test_get_recipe_detail` for new ingredient object shape
- `frontend/src/lib/api.js` — add pantry fetch helpers
- `frontend/src/pages/RecipeDetail.jsx` — split ingredients into On hand / Still need sections + "Add missing" button
- `frontend/src/App.jsx` — add `/pantry` route
- `frontend/src/components/Nav.jsx` — add Pantry as 5th tab

---

## Task 1: Pantry DB layer

**Files:**
- Create: `recipe_extractor/pantry.py`
- Create: `tests/test_pantry_db.py`

- [ ] **Step 1: Write failing tests in `tests/test_pantry_db.py`**

```python
import pytest
from pathlib import Path
from recipe_extractor.pantry import (
    init_pantry_table, add_item, list_items, delete_item, update_note
)


@pytest.fixture
def db(tmp_path):
    return tmp_path / "test.db"


def test_init_creates_table(db):
    init_pantry_table(db)
    from recipe_extractor.database import _connect
    with _connect(db) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pantry_items'"
        ).fetchone()
    assert row is not None


def test_add_and_list(db):
    item = add_item("garlic", "1 bulb", "Produce", db)
    assert item["name"] == "garlic"
    assert item["category"] == "Produce"
    assert item["note"] == "1 bulb"
    assert "id" in item

    items = list_items(db)
    assert len(items) == 1
    assert items[0]["name"] == "garlic"


def test_add_duplicate_raises(db):
    import sqlite3
    add_item("garlic", None, "Produce", db)
    with pytest.raises(sqlite3.IntegrityError):
        add_item("garlic", None, "Produce", db)


def test_list_sorted_by_category_then_name(db):
    add_item("zucchini", None, "Produce", db)
    add_item("butter", None, "Dairy", db)
    add_item("apple", None, "Produce", db)
    items = list_items(db)
    names = [i["name"] for i in items]
    assert names == ["butter", "apple", "zucchini"]


def test_delete_item(db):
    item = add_item("salt", None, "Pantry", db)
    assert delete_item(item["id"], db) is True
    assert list_items(db) == []


def test_delete_nonexistent_returns_false(db):
    init_pantry_table(db)
    assert delete_item(9999, db) is False


def test_update_note(db):
    item = add_item("flour", "1 bag", "Pantry", db)
    updated = update_note(item["id"], "running low", db)
    assert updated["note"] == "running low"
    assert updated["name"] == "flour"


def test_update_note_nonexistent_returns_none(db):
    init_pantry_table(db)
    assert update_note(9999, "test", db) is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
pytest tests/test_pantry_db.py -v
```

Expected: `ImportError` — `recipe_extractor.pantry` does not exist yet.

- [ ] **Step 3: Create `recipe_extractor/pantry.py`**

```python
"""SQLite persistence layer for pantry items."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from recipe_extractor.database import DB_PATH, _connect


def init_pantry_table(db_path: Path = DB_PATH) -> None:
    """Create pantry_items table if it doesn't exist."""
    with _connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pantry_items (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT    NOT NULL UNIQUE,
                note      TEXT,
                category  TEXT    NOT NULL DEFAULT 'Other',
                added_at  TEXT    NOT NULL
            )
        """)


def add_item(
    name: str,
    note: Optional[str],
    category: str,
    db_path: Path = DB_PATH,
) -> dict:
    """Insert a new pantry item. Raises sqlite3.IntegrityError on duplicate name."""
    init_pantry_table(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO pantry_items (name, note, category, added_at) VALUES (?, ?, ?, ?)",
            (name, note, category, now),
        )
        return {"id": cur.lastrowid, "name": name, "note": note, "category": category, "added_at": now}


def list_items(db_path: Path = DB_PATH) -> list[dict]:
    """Return all pantry items sorted by category then name."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, note, category, added_at FROM pantry_items "
            "ORDER BY category, name COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_item(item_id: int, db_path: Path = DB_PATH) -> bool:
    """Delete a pantry item by id. Returns True if a row was deleted."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM pantry_items WHERE id = ?", (item_id,))
    return cur.rowcount > 0


def update_note(item_id: int, note: str, db_path: Path = DB_PATH) -> Optional[dict]:
    """Update the note field of a pantry item. Returns updated item or None if not found."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute(
            "UPDATE pantry_items SET note = ? WHERE id = ?", (note, item_id)
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, name, note, category, added_at FROM pantry_items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return dict(row)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_pantry_db.py -v
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add recipe_extractor/pantry.py tests/test_pantry_db.py
git commit -m "feat: add pantry DB layer (pantry_items table)"
```

---

## Task 2: Normalization utilities

**Files:**
- Create: `api/utils/__init__.py`
- Create: `api/utils/normalizer.py`
- Create: `tests/test_normalizer.py`

- [ ] **Step 1: Write failing tests in `tests/test_normalizer.py`**

```python
from api.utils.normalizer import normalize_ingredient, detect_category, is_on_hand


# --- normalize_ingredient ---

def test_strips_quantity_and_unit():
    assert normalize_ingredient("2 cups all-purpose flour") == "allpurpose flour"


def test_strips_prep_note_after_comma():
    assert normalize_ingredient("3 cloves garlic, minced") == "garlic"


def test_strips_parenthetical():
    assert normalize_ingredient("1 tsp salt (optional)") == "salt"


def test_strips_filler_adjective():
    assert normalize_ingredient("fresh basil leaves") == "basil leaves"


def test_strips_fraction():
    assert normalize_ingredient("1/2 tsp black pepper") == "black pepper"


def test_handles_metric():
    assert normalize_ingredient("200g spaghetti") == "spaghetti"


def test_empty_string_returns_empty():
    assert normalize_ingredient("   ") == ""


def test_only_number_returns_empty():
    assert normalize_ingredient("2") == ""


# --- is_on_hand ---

def test_on_hand_exact():
    assert is_on_hand("salt", ["salt"]) is True


def test_on_hand_with_quantity():
    assert is_on_hand("3 cloves garlic, minced", ["garlic"]) is True


def test_on_hand_partial_match():
    assert is_on_hand("2 cups all-purpose flour, sifted", ["flour"]) is True


def test_not_on_hand():
    assert is_on_hand("150g pancetta", ["garlic", "flour"]) is False


def test_direction_check_rice_flour():
    # "rice flour" in pantry should NOT match the ingredient "rice"
    # because "rice flour" is not a substring of normalized "rice"
    assert is_on_hand("rice", ["rice flour"]) is False


def test_on_hand_empty_pantry():
    assert is_on_hand("garlic", []) is False


# --- detect_category ---

def test_detects_produce():
    assert detect_category("garlic") == "Produce"


def test_detects_dairy():
    assert detect_category("butter") == "Dairy"


def test_detects_spices():
    assert detect_category("cumin") == "Spices"


def test_detects_pantry():
    assert detect_category("olive oil") == "Pantry"


def test_detects_meat():
    assert detect_category("chicken breast") == "Meat"


def test_unknown_falls_back_to_other():
    assert detect_category("xanthan gum") == "Other"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_normalizer.py -v
```

Expected: `ImportError` — module doesn't exist yet.

- [ ] **Step 3: Create `api/utils/__init__.py`** (empty file)

- [ ] **Step 4: Create `api/utils/normalizer.py`**

```python
"""Ingredient normalization, category detection, and pantry matching."""

import re
from typing import Optional

# Strip trailing prep notes: ", minced", "(optional)", "; to taste"
_PREP_RE = re.compile(r'\s*,.*$|\s*\(.*?\)|\s*;.*$')

# Strip leading number (including fractions like 1/2, decimals, ranges like 1-2)
_NUM_RE = re.compile(r'^\s*(?:a\s+(?:pinch|dash|handful)\s+of\s+)?(?:\d[\d\s/\.\-]*\s*)?')

# Strip leading unit word after number has been removed
_UNIT_RE = re.compile(
    r'^(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|'
    r'grams?|g\b|kg|cloves?|stalks?|heads?|bunches?|slices?|cans?|jars?|bags?|'
    r'pieces?|sprigs?|pinch(?:es)?|dashes?)\s+',
    re.IGNORECASE,
)

# Strip common filler adjectives
_FILLER_RE = re.compile(
    r'\b(?:fresh|freshly|dried|large|small|medium|extra|virgin|fine|ground|'
    r'whole|raw|divided|ripe|firm|cooked|chopped|sliced|diced)\b\s*',
    re.IGNORECASE,
)

_PUNCT_RE = re.compile(r'[^a-z0-9\s]')
_SPACE_RE = re.compile(r'\s+')


def normalize_ingredient(ingredient: str) -> str:
    """Strip quantity, unit, prep notes, and filler words from a recipe ingredient string."""
    s = ingredient.lower()
    s = _PREP_RE.sub('', s)
    s = _NUM_RE.sub('', s)
    s = _UNIT_RE.sub('', s)
    s = _FILLER_RE.sub('', s)
    s = _PUNCT_RE.sub('', s)
    return _SPACE_RE.sub(' ', s).strip()


def is_on_hand(ingredient: str, pantry_names: list[str]) -> bool:
    """Return True if any pantry item name is a substring of the normalized ingredient.

    Intentionally one-directional: we check that the pantry item is contained
    within the normalized ingredient string — NOT the other way around.
    The reverse direction causes false positives: "rice flour" in pantry would
    incorrectly match the ingredient "rice" because "rice" is in "rice flour".
    """
    norm = normalize_ingredient(ingredient)
    return any(item.lower() in norm for item in pantry_names)


# Category detection lookup. More-specific keys come before general ones
# so that e.g. "bell pepper" → Produce before "pepper" → Spices.
CATEGORY_MAP: dict[str, str] = {
    # Produce
    "bell pepper": "Produce", "green onion": "Produce", "scallion": "Produce",
    "garlic": "Produce", "onion": "Produce", "tomato": "Produce",
    "lemon": "Produce", "lime": "Produce", "potato": "Produce", "carrot": "Produce",
    "celery": "Produce", "spinach": "Produce", "kale": "Produce", "lettuce": "Produce",
    "mushroom": "Produce", "zucchini": "Produce", "eggplant": "Produce",
    "broccoli": "Produce", "cauliflower": "Produce", "cabbage": "Produce",
    "avocado": "Produce", "cucumber": "Produce", "ginger": "Produce",
    "shallot": "Produce", "leek": "Produce", "basil": "Produce", "parsley": "Produce",
    "cilantro": "Produce", "mint": "Produce", "thyme": "Produce", "rosemary": "Produce",
    "sage": "Produce", "dill": "Produce", "chive": "Produce",
    "apple": "Produce", "banana": "Produce", "orange": "Produce",
    "strawberry": "Produce", "blueberry": "Produce", "grape": "Produce",
    "mango": "Produce", "pineapple": "Produce", "peach": "Produce",
    "cherry": "Produce", "pear": "Produce", "raspberry": "Produce",
    # Dairy
    "heavy cream": "Dairy", "sour cream": "Dairy", "cream cheese": "Dairy",
    "half and half": "Dairy", "parmesan": "Dairy", "mozzarella": "Dairy",
    "cheddar": "Dairy", "ricotta": "Dairy", "buttermilk": "Dairy",
    "butter": "Dairy", "milk": "Dairy", "cream": "Dairy",
    "cheese": "Dairy", "egg": "Dairy", "yogurt": "Dairy",
    # Meat
    "ground beef": "Meat", "chicken": "Meat", "beef": "Meat", "pork": "Meat",
    "lamb": "Meat", "turkey": "Meat", "salmon": "Meat", "tuna": "Meat",
    "shrimp": "Meat", "bacon": "Meat", "sausage": "Meat", "ham": "Meat",
    "pancetta": "Meat", "prosciutto": "Meat", "chorizo": "Meat",
    "steak": "Meat", "cod": "Meat", "tilapia": "Meat",
    # Spices (before generic "pepper" and "oil" catch-alls)
    "black pepper": "Spices", "chili powder": "Spices", "chili flake": "Spices",
    "red pepper flake": "Spices", "garam masala": "Spices", "curry powder": "Spices",
    "bay leaf": "Spices", "pepper": "Spices", "cumin": "Spices", "paprika": "Spices",
    "turmeric": "Spices", "cinnamon": "Spices", "oregano": "Spices",
    "cayenne": "Spices", "coriander": "Spices", "cardamom": "Spices",
    "clove": "Spices", "nutmeg": "Spices", "allspice": "Spices",
    # Pantry (longer keys first to avoid early substring matches)
    "olive oil": "Pantry", "sesame oil": "Pantry", "vegetable oil": "Pantry",
    "canola oil": "Pantry", "coconut oil": "Pantry",
    "soy sauce": "Pantry", "fish sauce": "Pantry", "hot sauce": "Pantry",
    "worcestershire": "Pantry", "tomato paste": "Pantry", "tomato sauce": "Pantry",
    "baking powder": "Pantry", "baking soda": "Pantry",
    "maple syrup": "Pantry", "apple cider vinegar": "Pantry",
    "coconut milk": "Pantry", "breadcrumb": "Pantry",
    "flour": "Pantry", "sugar": "Pantry", "salt": "Pantry", "oil": "Pantry",
    "vinegar": "Pantry", "pasta": "Pantry", "rice": "Pantry", "bread": "Pantry",
    "stock": "Pantry", "broth": "Pantry", "honey": "Pantry", "vanilla": "Pantry",
    "cocoa": "Pantry", "chocolate": "Pantry", "oat": "Pantry",
    "almond": "Pantry", "walnut": "Pantry", "lentil": "Pantry",
    "bean": "Pantry", "chickpea": "Pantry", "quinoa": "Pantry",
    "cornstarch": "Pantry", "yeast": "Pantry", "mustard": "Pantry",
    "ketchup": "Pantry", "mayonnaise": "Pantry", "noodle": "Pantry",
    "tortilla": "Pantry",
}


def detect_category(name: str) -> str:
    """Auto-detect pantry category from item name. Falls back to 'Other'."""
    lower = name.lower()
    for key, cat in CATEGORY_MAP.items():
        if key in lower:
            return cat
    return "Other"
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pytest tests/test_normalizer.py -v
```

Expected: all tests pass. If any normalization test fails, tweak the regex in `normalizer.py` until it does — the tests define the contract, not the implementation.

- [ ] **Step 6: Commit**

```bash
git add api/utils/ tests/test_normalizer.py
git commit -m "feat: add ingredient normalizer and category detection"
```

---

## Task 3: Pantry API routes (TDD)

**Files:**
- Create: `api/routes/pantry.py`
- Modify: `api/main.py` (register router)
- Create: `tests/test_pantry.py`

- [ ] **Step 1: Write failing tests in `tests/test_pantry.py`**

```python
def test_list_empty(client):
    r = client.get("/api/pantry")
    assert r.status_code == 200
    assert r.json() == []


def test_add_item(client):
    r = client.post("/api/pantry", json={"name": "garlic"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "garlic"
    assert data["category"] == "Produce"
    assert data["note"] is None
    assert "id" in data


def test_add_item_with_note(client):
    r = client.post("/api/pantry", json={"name": "flour", "note": "1 bag"})
    assert r.status_code == 201
    assert r.json()["note"] == "1 bag"


def test_add_item_normalizes_name(client):
    # raw input "  Garlic  " should be stored as "garlic"
    r = client.post("/api/pantry", json={"name": "  Garlic  "})
    assert r.status_code == 201
    assert r.json()["name"] == "garlic"


def test_add_duplicate_returns_409(client):
    client.post("/api/pantry", json={"name": "garlic"})
    r = client.post("/api/pantry", json={"name": "garlic"})
    assert r.status_code == 409


def test_add_blank_name_returns_422(client):
    r = client.post("/api/pantry", json={"name": "   "})
    assert r.status_code == 422


def test_delete_item(client):
    add = client.post("/api/pantry", json={"name": "salt"})
    item_id = add.json()["id"]
    r = client.delete(f"/api/pantry/{item_id}")
    assert r.status_code == 204
    assert client.get("/api/pantry").json() == []


def test_delete_nonexistent_returns_404(client):
    r = client.delete("/api/pantry/9999")
    assert r.status_code == 404


def test_patch_note(client):
    add = client.post("/api/pantry", json={"name": "butter", "note": "1 block"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"note": "running low"})
    assert r.status_code == 200
    assert r.json()["note"] == "running low"


def test_patch_nonexistent_returns_404(client):
    r = client.patch("/api/pantry/9999", json={"note": "test"})
    assert r.status_code == 404


def test_list_sorted_by_category_then_name(client):
    client.post("/api/pantry", json={"name": "zucchini"})  # Produce
    client.post("/api/pantry", json={"name": "butter"})    # Dairy
    client.post("/api/pantry", json={"name": "apple"})     # Produce
    items = client.get("/api/pantry").json()
    names = [i["name"] for i in items]
    assert names == ["butter", "apple", "zucchini"]
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_pantry.py -v
```

Expected: errors — route doesn't exist yet.

- [ ] **Step 3: Create `api/routes/pantry.py`**

```python
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.pantry import add_item, list_items, delete_item, update_note
from api.utils.normalizer import normalize_ingredient, detect_category

router = APIRouter()


class AddItemRequest(BaseModel):
    name: str
    note: Optional[str] = None


class PatchNoteRequest(BaseModel):
    note: str


@router.get("/pantry")
def api_list_pantry(db: Path = Depends(get_db_path)):
    return list_items(db_path=db)


@router.post("/pantry", status_code=201)
def api_add_pantry_item(body: AddItemRequest, db: Path = Depends(get_db_path)):
    name = normalize_ingredient(body.name)
    if not name:
        raise HTTPException(status_code=422, detail="Please enter an ingredient name")
    category = detect_category(name)
    try:
        return add_item(name, body.note, category, db_path=db)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail=f"'{name}' is already in your pantry")


@router.delete("/pantry/{item_id}", status_code=204)
def api_delete_pantry_item(item_id: int, db: Path = Depends(get_db_path)):
    if not delete_item(item_id, db_path=db):
        raise HTTPException(status_code=404, detail="Item not found")


@router.patch("/pantry/{item_id}")
def api_patch_pantry_item(item_id: int, body: PatchNoteRequest, db: Path = Depends(get_db_path)):
    updated = update_note(item_id, body.note, db_path=db)
    if updated is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated
```

- [ ] **Step 4: Register the pantry router in `api/main.py`**

Add the import and `include_router` call alongside the existing ones:

```python
from api.routes import recipes, stats, export, pantry   # add pantry

# existing app setup...

app.include_router(pantry.router, prefix="/api")        # add this line
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pytest tests/test_pantry.py -v
```

Expected: all 11 tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routes/pantry.py api/main.py tests/test_pantry.py
git commit -m "feat: add pantry CRUD API endpoints"
```

---

## Task 4: Recipe on_hand integration (TDD)

**Files:**
- Modify: `api/routes/recipes.py`
- Modify: `tests/test_recipes.py` (update one existing test for new ingredient shape)
- Create: `tests/test_pantry_integration.py`

- [ ] **Step 1: Write new integration tests in `tests/test_pantry_integration.py`**

These tests seed both a recipe and pantry items, then verify `on_hand` and `makeable` fields.

```python
import pytest


# Reusable fake recipe with two ingredients
FAKE_RECIPE = {
    "title": "Test Pasta",
    "source_url": "https://example.com/pasta",
    "ingredients": ["3 cloves garlic, minced", "150g pancetta"],
    "instructions": ["Cook it"],
    "cuisine": "Italian", "category": "Dinner", "servings": "2",
    "prep_time": 5, "cook_time": 15, "total_time": 20,
    "calories": 400.0, "protein_g": None, "carbs_g": None,
    "fat_g": None, "fiber_g": None, "image_url": "", "description": "", "tags": [],
}


@pytest.fixture
def seeded_client(client, monkeypatch):
    """Client with one recipe already saved."""
    import api.routes.recipes as mod
    monkeypatch.setattr(mod, "extract_recipe", lambda url: {**FAKE_RECIPE, "source_url": url})
    client.post("/api/recipes", json={"url": "https://example.com/pasta"})
    return client


def test_recipe_detail_ingredients_have_on_hand_field(seeded_client):
    recipes = seeded_client.get("/api/recipes").json()
    recipe_id = recipes[0]["id"]
    r = seeded_client.get(f"/api/recipes/{recipe_id}")
    assert r.status_code == 200
    ingredients = r.json()["ingredients"]
    # Should be list of objects, not plain strings
    assert isinstance(ingredients[0], dict)
    assert "text" in ingredients[0]
    assert "on_hand" in ingredients[0]


def test_on_hand_false_with_empty_pantry(seeded_client):
    recipe_id = seeded_client.get("/api/recipes").json()[0]["id"]
    ingredients = seeded_client.get(f"/api/recipes/{recipe_id}").json()["ingredients"]
    assert all(not ing["on_hand"] for ing in ingredients)


def test_on_hand_true_when_pantry_has_item(seeded_client):
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    recipe_id = seeded_client.get("/api/recipes").json()[0]["id"]
    ingredients = seeded_client.get(f"/api/recipes/{recipe_id}").json()["ingredients"]

    garlic_ing = next(i for i in ingredients if "garlic" in i["text"])
    pancetta_ing = next(i for i in ingredients if "pancetta" in i["text"])

    assert garlic_ing["on_hand"] is True
    assert pancetta_ing["on_hand"] is False


def test_makeable_false_with_missing_ingredients(seeded_client):
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    recipes = seeded_client.get("/api/recipes").json()
    assert recipes[0]["makeable"] is False


def test_makeable_true_when_all_on_hand(seeded_client):
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    seeded_client.post("/api/pantry", json={"name": "pancetta"})
    recipes = seeded_client.get("/api/recipes").json()
    assert recipes[0]["makeable"] is True


def test_makeable_filter(seeded_client):
    # Without all ingredients, should not appear in ?makeable=true
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    r = seeded_client.get("/api/recipes?makeable=true")
    assert r.json() == []

    # Add missing ingredient — now it should appear
    seeded_client.post("/api/pantry", json={"name": "pancetta"})
    r2 = seeded_client.get("/api/recipes?makeable=true")
    assert len(r2.json()) == 1


def test_recipe_list_always_has_makeable_field(seeded_client):
    recipes = seeded_client.get("/api/recipes").json()
    assert "makeable" in recipes[0]
```

- [ ] **Step 2: Run integration tests to confirm they fail**

```bash
pytest tests/test_pantry_integration.py -v
```

Expected: failures because `on_hand` and `makeable` fields don't exist yet.

- [ ] **Step 3: Update `test_get_recipe_detail` in `tests/test_recipes.py`**

The existing test asserts `ingredients == ["1 cup flour"]` (plain strings). After this task ingredients become objects. Find and update that assertion:

Old:
```python
assert r.json()["ingredients"] == ["1 cup flour"]
```

New:
```python
ings = r.json()["ingredients"]
assert len(ings) == 1
assert ings[0]["text"] == "1 cup flour"
assert "on_hand" in ings[0]
```

- [ ] **Step 4: Modify `api/routes/recipes.py`**

Add imports at the top:
```python
from recipe_extractor.pantry import list_items
from api.utils.normalizer import is_on_hand
```

Replace `api_list_recipes`:
```python
@router.get("/recipes")
def api_list_recipes(
    q: Optional[str] = None,
    makeable: bool = False,
    db: Path = Depends(get_db_path),
):
    recipes = search_recipes(q, db_path=db) if q else list_recipes(db_path=db)
    pantry_names = [item["name"] for item in list_items(db_path=db)]
    for r in recipes:
        if pantry_names:
            full = get_recipe(r["id"], db_path=db)
            r["makeable"] = all(is_on_hand(ing, pantry_names) for ing in full["ingredients"])
        else:
            r["makeable"] = False
    if makeable:
        recipes = [r for r in recipes if r["makeable"]]
    return recipes
```

Replace `api_get_recipe`:
```python
@router.get("/recipes/{recipe_id}")
def api_get_recipe(recipe_id: int, db: Path = Depends(get_db_path)):
    recipe = get_recipe(recipe_id, db_path=db)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    pantry_names = [item["name"] for item in list_items(db_path=db)]
    recipe["ingredients"] = [
        {"text": ing, "on_hand": is_on_hand(ing, pantry_names)}
        for ing in recipe["ingredients"]
    ]
    return recipe
```

- [ ] **Step 5: Run all tests**

```bash
pytest tests/ -v
```

Expected: all tests pass, including the updated `test_get_recipe_detail` and all integration tests.

- [ ] **Step 6: Commit**

```bash
git add api/routes/recipes.py tests/test_recipes.py tests/test_pantry_integration.py
git commit -m "feat: add on_hand per ingredient and makeable flag to recipe routes"
```

---

## Task 5: Pantry page frontend

**Files:**
- Modify: `frontend/src/lib/api.js` (add pantry helpers)
- Create: `frontend/src/pages/Pantry.jsx`

- [ ] **Step 1: Add pantry helpers to `frontend/src/lib/api.js`**

Append these functions to the existing `api.js`:

```js
// Pantry
export const getPantry  = ()            => fetch('/api/pantry').then(r => r.json());
export const addPantryItem = (name, note) =>
  fetch('/api/pantry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, note: note || undefined }),
  });
export const deletePantryItem = (id) =>
  fetch(`/api/pantry/${id}`, { method: 'DELETE' });
export const patchPantryNote = (id, note) =>
  fetch(`/api/pantry/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  }).then(r => r.json());
```

- [ ] **Step 2: Create `frontend/src/pages/Pantry.jsx`**

```jsx
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
    getPantry().then(setItems);
    // Fetch makeable count
    fetch('/api/recipes?makeable=true')
      .then(r => r.json())
      .then(rs => setMakeableCount(rs.length));
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
    if (res.status === 409) {
      setError(`"${name}" is already in your pantry`);
      return;
    }
    if (res.status === 422) {
      setError('Please enter an ingredient name');
      return;
    }
    const item = await res.json();
    setItems(prev => [...prev, item].sort((a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    ));
    setInput('');
    // Refresh makeable count
    fetch('/api/recipes?makeable=true').then(r => r.json()).then(rs => setMakeableCount(rs.length));
  }

  async function handleDelete(id) {
    await deletePantryItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
    fetch('/api/recipes?makeable=true').then(r => r.json()).then(rs => setMakeableCount(rs.length));
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
```

- [ ] **Step 3: Start the dev servers and verify the page loads**

```bash
# Terminal 1
cd "H:/Other/Claude Projects/shiny-enigma/api"
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd "H:/Other/Claude Projects/shiny-enigma/frontend"
npm run dev -- --host
```

Open http://localhost:5173/pantry. Expected: Pantry page renders, quick-add works, items appear grouped by category.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/pages/Pantry.jsx
git commit -m "feat: add Pantry page with category groups and makeable banner"
```

---

## Task 6: Recipe Detail ingredient sections

**Files:**
- Modify: `frontend/src/pages/RecipeDetail.jsx`

The ingredient list now returns `[{ text, on_hand }]` objects from the API. Split into two sections: **On hand** and **Still need**. Add "Add missing to pantry" button.

Client-side normalization mirrors the backend pipeline so the button can post clean names without a round-trip.

- [ ] **Step 1: Add `pantryEmpty` state to `RecipeDetail.jsx`**

The "Add items to your pantry" prompt must only show when the pantry is actually empty — not just when no pantry items happen to match this recipe. Add a fetch for pantry size inside the existing `useEffect` (or alongside the recipe fetch):

```js
const [pantryEmpty, setPantryEmpty] = useState(true);

useEffect(() => {
  // existing recipe fetch ...
  fetch('/api/pantry')
    .then(r => r.json())
    .then(items => setPantryEmpty(items.length === 0));
}, [id]);  // id = the recipe id param
```

This single extra request runs once on load and lets the component distinguish "pantry is empty" from "pantry has items but none match this recipe."

- [ ] **Step 2: Add client-side normalize helper at the top of `RecipeDetail.jsx`**

Add this helper function before the component definition:

```js
// Mirrors api/utils/normalizer.py — strips quantities/units/prep from ingredient strings
function normalizeIngredient(text) {
  let s = text.toLowerCase();
  s = s.replace(/\s*,.*$|\s*\(.*?\)|\s*;.*$/g, '');          // strip prep notes
  s = s.replace(/^\s*(?:a\s+(?:pinch|dash|handful)\s+of\s+)?(?:\d[\d\s/.\-]*\s*)?/, ''); // strip number
  s = s.replace(/^(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|grams?|g\b|kg|cloves?|stalks?|heads?|bags?|cans?|pieces?|sprigs?|pinch(?:es)?|dashes?)\s+/i, ''); // strip unit
  s = s.replace(/\b(?:fresh|freshly|dried|large|small|medium|extra|virgin|fine|ground|whole|raw|divided|ripe|firm|cooked|chopped|sliced|diced)\b\s*/gi, ''); // strip fillers
  s = s.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return s;
}
```

- [ ] **Step 3: Replace the ingredient list rendering in `RecipeDetail.jsx`**

Find the section that renders `recipe.ingredients` (likely a `<ul>` or `.map()` over the array) and replace with:

```jsx
{/* Pantry prompt — only when pantry is truly empty */}
{pantryEmpty && recipe.ingredients.length > 0 && (
  <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
    Add items to your pantry to see what you have on hand.
  </p>
)}

{/* On hand section */}
{recipe.ingredients.some(i => i.on_hand) && (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>On hand</div>
    {recipe.ingredients.filter(i => i.on_hand).map((ing, idx) => (
      <div key={idx} style={{
        padding: '8px 12px', background: '#1f2937',
        borderLeft: '3px solid #22c55e', borderRadius: 8, marginBottom: 3,
        color: '#f3f4f6', fontSize: 14,
      }}>
        {ing.text}
      </div>
    ))}
  </div>
)}

{/* Still need section */}
{recipe.ingredients.some(i => !i.on_hand) && (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}>
      {recipe.ingredients.some(i => i.on_hand) ? 'Still need' : 'Ingredients'}
    </div>
    {recipe.ingredients.filter(i => !i.on_hand).map((ing, idx) => (
      <div key={idx} style={{
        padding: '8px 12px', background: '#1f2937',
        borderLeft: recipe.ingredients.some(i => i.on_hand) ? '3px solid #ef4444' : '3px solid #374151',
        borderRadius: 8, marginBottom: 3,
        color: '#f3f4f6', fontSize: 14,
      }}>
        {ing.text}
      </div>
    ))}
  </div>
)}

{/* Add missing to pantry */}
{recipe.ingredients.some(i => !i.on_hand) && (
  <AddMissingButton missingIngredients={recipe.ingredients.filter(i => !i.on_hand).map(i => i.text)} />
)}
```

- [ ] **Step 4: Add the `AddMissingButton` component to `RecipeDetail.jsx`**

Add this component just above the main `RecipeDetail` component definition:

```jsx
function AddMissingButton({ missingIngredients }) {
  const [status, setStatus] = useState('');

  async function handleClick() {
    setStatus('Adding...');
    let added = 0;
    for (const text of missingIngredients) {
      const name = normalizeIngredient(text);
      if (!name) continue;
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.status === 201) added++;
      // 409 = already in pantry, silently skip
    }
    setStatus(added > 0 ? `Added ${added} item${added !== 1 ? 's' : ''} to pantry` : 'All already in pantry');
    setTimeout(() => setStatus(''), 3000);
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={handleClick}
        style={{
          background: '#1f2937', color: '#9ca3af', border: '1px solid #374151',
          borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        }}
      >
        Add missing to pantry
      </button>
      {status && <span style={{ marginLeft: 10, fontSize: 12, color: '#6ee7b7' }}>{status}</span>}
    </div>
  );
}
```

Don't forget to add `useState` to the import at the top of `RecipeDetail.jsx` if it isn't there already.

- [ ] **Step 5: Verify in browser**

Open a recipe detail page. With an empty pantry, all ingredients show in a single "Ingredients" list. After adding some pantry items, the list splits into On hand / Still need. "Add missing to pantry" button adds the remaining items.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RecipeDetail.jsx
git commit -m "feat: split recipe ingredients into on-hand/still-need sections"
```

---

## Task 7: Nav + routing

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Nav.jsx`

- [ ] **Step 1: Add `/pantry` route to `App.jsx`**

Import the Pantry page at the top with the other page imports:
```jsx
import Pantry from './pages/Pantry';
```

Add the route inside the `<Routes>` block, alongside the existing routes:
```jsx
<Route path="/pantry" element={<Pantry />} />
```

- [ ] **Step 2: Add Pantry tab to `Nav.jsx`**

Find the nav items array (or JSX) and add a Pantry entry between Add and Stats:

```jsx
{ path: '/pantry', label: 'Pantry' }
```

The nav now has five items: **Recipes | Search | Add | Pantry | Stats**

For mobile bottom tabs: if the nav uses a fixed grid, update the `grid-template-columns` from `repeat(4, 1fr)` to `repeat(5, 1fr)`.

- [ ] **Step 3: Verify in browser**

Open http://localhost:5173. The Pantry tab appears in the nav. Clicking it loads the Pantry page. Mobile view shows 5 tabs in the bottom bar.

- [ ] **Step 4: Run all backend tests one final time**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 5: Final commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Nav.jsx
git commit -m "feat: add Pantry tab to nav and wire up route"
```
