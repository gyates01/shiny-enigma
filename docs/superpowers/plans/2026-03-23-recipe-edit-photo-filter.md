# Recipe Edit, Photo, and Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recipe editing (all fields), photo attachment (upload or URL), and structured filtering (cuisine, category, max cook time) to the existing FastAPI + React recipe web app.

**Architecture:** New DB functions (`filter_recipes`, `update_recipe`) back two new API endpoints (`PUT /api/recipes/{id}`, `POST /api/recipes/{id}/image`), extending the existing `GET /api/recipes` with filter params. The React frontend gets a new `/recipes/:id/edit` page, a filter bar on the list page, and photo display throughout. Uploaded images are stored in `data/images/` and served as static files at `/images/`.

**Tech Stack:** Python/FastAPI, SQLite (via `recipe_extractor/database.py`), React 18, Vite, React Router v6. Tests: pytest + FastAPI TestClient.

**Spec:** `docs/superpowers/specs/2026-03-23-recipe-edit-photo-filter-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `recipe_extractor/database.py` | Modify | Add `filter_recipes()`, `update_recipe()`; add `image_url` to `list_recipes`/`search_recipes` SELECT |
| `api/routes/recipes.py` | Modify | Add `PUT /{id}`, `POST /{id}/image`; swap list route to use `filter_recipes` |
| `api/main.py` | Modify | Mount `data/images/` at `/images/` before SPA catch-all |
| `frontend/vite.config.js` | Modify | Proxy `/images` to FastAPI in dev mode |
| `frontend/src/lib/api.js` | Modify | Add `updateRecipe`, `uploadImage`; update `listRecipes` signature |
| `frontend/src/App.jsx` | Modify | Add `/recipes/:id/edit` route |
| `frontend/src/pages/EditRecipe.jsx` | Create | Full-page edit form |
| `frontend/src/pages/RecipeDetail.jsx` | Modify | Add photo display + Edit button |
| `frontend/src/pages/RecipeList.jsx` | Modify | Add filter bar + thumbnails |
| `tests/test_recipes.py` | Modify | Add tests for filter, update, and image upload |

---

## Task 1: Database Layer — filter_recipes, update_recipe, image_url in list

**Files:**
- Modify: `recipe_extractor/database.py`
- Test: `tests/test_recipes.py`

Context: `database.py` currently has `list_recipes`, `search_recipes`, `get_recipe`, `save_recipe`, `delete_recipe`, `get_stats`. The `list_recipes` and `search_recipes` SELECTs omit `image_url`. Tests use the `client` fixture from `conftest.py` which uses a temp SQLite DB via dependency override.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_recipes.py`:

```python
from recipe_extractor.database import filter_recipes, update_recipe, save_recipe, init_db


def _seed(db, **overrides):
    """Helper: save a recipe to db and return its id."""
    recipe = {
        "title": "Test", "source_url": "https://example.com/test",
        "ingredients": ["flour"], "instructions": ["mix"],
        "cuisine": "Italian", "category": "Dinner",
        "servings": "4", "prep_time": 10, "cook_time": 20, "total_time": 30,
        "calories": 300.0, "protein_g": None, "carbs_g": None,
        "fat_g": None, "fiber_g": None, "image_url": "https://img.com/a.jpg",
        "description": "", "tags": [],
    }
    recipe.update(overrides)
    return save_recipe(recipe, db_path=db)


def test_filter_recipes_returns_all_when_no_filters(tmp_db):
    _seed(tmp_db)
    _seed(tmp_db, title="Other", source_url="https://example.com/other",
          cuisine="French", category="Lunch")
    results = filter_recipes(db_path=tmp_db)
    assert len(results) == 2


def test_filter_recipes_by_cuisine(tmp_db):
    _seed(tmp_db)
    _seed(tmp_db, title="French dish", source_url="https://example.com/french",
          cuisine="French", category="Lunch")
    results = filter_recipes(cuisine="Italian", db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["cuisine"] == "Italian"


def test_filter_recipes_by_category(tmp_db):
    _seed(tmp_db)
    _seed(tmp_db, title="Lunch dish", source_url="https://example.com/lunch",
          cuisine="Italian", category="Lunch")
    results = filter_recipes(category="Dinner", db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["category"] == "Dinner"


def test_filter_recipes_by_max_time(tmp_db):
    _seed(tmp_db)  # total_time=30
    _seed(tmp_db, title="Quick", source_url="https://example.com/quick",
          total_time=15)
    results = filter_recipes(max_time=20, db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["title"] == "Quick"


def test_filter_recipes_combined(tmp_db):
    _seed(tmp_db)  # Italian, Dinner, 30 min
    _seed(tmp_db, title="French dinner", source_url="https://example.com/fd",
          cuisine="French", category="Dinner", total_time=25)
    results = filter_recipes(cuisine="Italian", max_time=30, db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["cuisine"] == "Italian"


def test_filter_recipes_includes_image_url(tmp_db):
    _seed(tmp_db)
    results = filter_recipes(db_path=tmp_db)
    assert "image_url" in results[0]
    assert results[0]["image_url"] == "https://img.com/a.jpg"


def test_filter_recipes_text_query(tmp_db):
    _seed(tmp_db)  # title="Test"
    _seed(tmp_db, title="Pasta", source_url="https://example.com/pasta",
          cuisine="Italian")
    results = filter_recipes(query="Pasta", db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["title"] == "Pasta"


def test_update_recipe_title(tmp_db):
    rid = _seed(tmp_db)
    result = update_recipe(rid, {"title": "Updated"}, db_path=tmp_db)
    assert result is True
    from recipe_extractor.database import get_recipe
    r = get_recipe(rid, db_path=tmp_db)
    assert r["title"] == "Updated"


def test_update_recipe_list_fields_stored_as_json(tmp_db):
    rid = _seed(tmp_db)
    update_recipe(rid, {"ingredients": ["a", "b"], "tags": ["quick"]}, db_path=tmp_db)
    from recipe_extractor.database import get_recipe
    r = get_recipe(rid, db_path=tmp_db)
    assert r["ingredients"] == ["a", "b"]
    assert r["tags"] == ["quick"]


def test_update_recipe_nonexistent_returns_false(tmp_db):
    init_db(tmp_db)
    result = update_recipe(9999, {"title": "x"}, db_path=tmp_db)
    assert result is False
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
python -m pytest tests/test_recipes.py::test_filter_recipes_returns_all_when_no_filters tests/test_recipes.py::test_update_recipe_title -v
```

Expected: `ImportError` or `FAILED` — `filter_recipes` and `update_recipe` don't exist yet.

- [ ] **Step 3: Implement the changes in `recipe_extractor/database.py`**

**3a.** Add `image_url` to `list_recipes` SELECT (around line 123):

```python
def list_recipes(db_path: Path = DB_PATH) -> list[dict]:
    """Return all recipes as a list of dicts (lightweight — no ingredients/instructions)."""
    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute("""
            SELECT id, title, cuisine, category, total_time, calories, servings,
                   date_added, source_url, image_url
            FROM recipes
            ORDER BY date_added DESC
        """).fetchall()
    return [dict(r) for r in rows]
```

**3b.** Add `image_url` to `search_recipes` SELECT (around line 138):

```python
def search_recipes(query: str, db_path: Path = DB_PATH) -> list[dict]:
    """Full-text search across title, cuisine, category, tags, ingredients."""
    init_db(db_path)
    like = f"%{query}%"
    with _connect(db_path) as conn:
        rows = conn.execute("""
            SELECT id, title, cuisine, category, total_time, calories, servings,
                   date_added, source_url, image_url
            FROM recipes
            WHERE title       LIKE :q COLLATE NOCASE
               OR cuisine     LIKE :q COLLATE NOCASE
               OR category    LIKE :q COLLATE NOCASE
               OR tags        LIKE :q COLLATE NOCASE
               OR ingredients LIKE :q COLLATE NOCASE
               OR description LIKE :q COLLATE NOCASE
            ORDER BY date_added DESC
        """, {"q": like}).fetchall()
    return [dict(r) for r in rows]
```

**3c.** Add `filter_recipes` after `search_recipes`:

```python
def filter_recipes(
    query: str = "",
    cuisine: str = "",
    category: str = "",
    max_time: int = None,
    db_path: Path = DB_PATH,
) -> list[dict]:
    """Return recipes matching all provided filters. Empty/None values are ignored."""
    init_db(db_path)
    conditions = []
    params: dict = {}

    if query:
        conditions.append("""(
            title       LIKE :q COLLATE NOCASE
            OR cuisine  LIKE :q COLLATE NOCASE
            OR category LIKE :q COLLATE NOCASE
            OR tags     LIKE :q COLLATE NOCASE
            OR ingredients LIKE :q COLLATE NOCASE
            OR description LIKE :q COLLATE NOCASE
        )""")
        params["q"] = f"%{query}%"

    if cuisine:
        conditions.append("cuisine = :cuisine COLLATE NOCASE")
        params["cuisine"] = cuisine

    if category:
        conditions.append("category = :category COLLATE NOCASE")
        params["category"] = category

    if max_time is not None:
        conditions.append("total_time IS NOT NULL AND total_time <= :max_time")
        params["max_time"] = max_time

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    with _connect(db_path) as conn:
        rows = conn.execute(f"""
            SELECT id, title, cuisine, category, total_time, calories, servings,
                   date_added, source_url, image_url
            FROM recipes
            {where}
            ORDER BY date_added DESC
        """, params).fetchall()
    return [dict(r) for r in rows]
```

**3d.** Add `update_recipe` after `filter_recipes`:

```python
def update_recipe(recipe_id: int, fields: dict, db_path: Path = DB_PATH) -> bool:
    """Update editable fields of a recipe. Returns True if a row was updated.

    List-type fields (ingredients, instructions, tags) are JSON-encoded automatically.
    source_url and date_added are not updatable.
    """
    ALLOWED = {
        "title", "description", "servings", "prep_time", "cook_time", "total_time",
        "cuisine", "category", "tags", "ingredients", "instructions",
        "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "image_url",
    }
    LIST_FIELDS = {"tags", "ingredients", "instructions"}

    safe = {k: v for k, v in fields.items() if k in ALLOWED}
    if not safe:
        return False

    for k in LIST_FIELDS:
        if k in safe and isinstance(safe[k], list):
            safe[k] = json.dumps(safe[k])

    clauses = ", ".join(f"{k} = :{k}" for k in safe)
    safe["_id"] = recipe_id

    init_db(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute(
            f"UPDATE recipes SET {clauses} WHERE id = :_id", safe
        )
    return cur.rowcount > 0
```

- [ ] **Step 4: Run all new tests**

```bash
python -m pytest tests/test_recipes.py -k "filter_recipes or update_recipe" -v
```

Expected: All 10 new tests PASS.

- [ ] **Step 5: Run full test suite to confirm nothing is broken**

```bash
python -m pytest tests/ -v
```

Expected: All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add recipe_extractor/database.py tests/test_recipes.py
git commit -m "feat: add filter_recipes, update_recipe; add image_url to list SELECT"
```

---

## Task 2: Image Upload Endpoint + Static Mount + Vite Proxy

**Files:**
- Modify: `api/routes/recipes.py`
- Modify: `api/main.py`
- Modify: `frontend/vite.config.js`
- Test: `tests/test_recipes.py`

Context: Images are saved to `db.parent / "images"` (derived from the injected db path, so tests get an isolated tmp dir). FastAPI mounts `data/images/` at `/images/` — this mount MUST be registered before the SPA catch-all route. Vite proxies `/images` to FastAPI in dev mode.

- [ ] **Step 1: Write failing tests for image upload**

Add to `tests/test_recipes.py`:

```python
def test_upload_image_success(client, monkeypatch, tmp_path):
    # seed a recipe
    import api.routes.recipes as recipes_mod
    fake = {
        "title": "Photo Recipe", "source_url": "https://example.com/photo",
        "ingredients": [], "instructions": [], "cuisine": "", "category": "",
        "servings": "", "prep_time": None, "cook_time": None, "total_time": None,
        "calories": None, "protein_g": None, "carbs_g": None, "fat_g": None,
        "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda url: {**fake, "source_url": url})
    add = client.post("/api/recipes", json={"url": "https://example.com/photo"})
    rid = add.json()["id"]

    # upload a tiny valid JPEG (minimal 2x2 JFIF)
    tiny_jpeg = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
        b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
        b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x1e"
        b"\xff\xd9"
    )
    r = client.post(
        f"/api/recipes/{rid}/image",
        files={"file": ("test.jpg", tiny_jpeg, "image/jpeg")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["image_url"].startswith("/images/")
    assert data["image_url"].endswith(".jpg")


def test_upload_image_unsupported_type(client, monkeypatch):
    import api.routes.recipes as recipes_mod
    fake = {
        "title": "T", "source_url": "https://example.com/t2",
        "ingredients": [], "instructions": [], "cuisine": "", "category": "",
        "servings": "", "prep_time": None, "cook_time": None, "total_time": None,
        "calories": None, "protein_g": None, "carbs_g": None, "fat_g": None,
        "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda url: {**fake, "source_url": url})
    add = client.post("/api/recipes", json={"url": "https://example.com/t2"})
    rid = add.json()["id"]

    r = client.post(
        f"/api/recipes/{rid}/image",
        files={"file": ("doc.pdf", b"%PDF", "application/pdf")},
    )
    assert r.status_code == 422


def test_upload_image_recipe_not_found(client):
    tiny_jpeg = b"\xff\xd8\xff\xd9"
    r = client.post(
        "/api/recipes/9999/image",
        files={"file": ("x.jpg", tiny_jpeg, "image/jpeg")},
    )
    assert r.status_code == 404


def test_upload_image_too_large(client, monkeypatch):
    import api.routes.recipes as recipes_mod
    fake = {
        "title": "Big", "source_url": "https://example.com/big",
        "ingredients": [], "instructions": [], "cuisine": "", "category": "",
        "servings": "", "prep_time": None, "cook_time": None, "total_time": None,
        "calories": None, "protein_g": None, "carbs_g": None, "fat_g": None,
        "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda u: {**fake, "source_url": u})
    add = client.post("/api/recipes", json={"url": "https://example.com/big"})
    rid = add.json()["id"]

    # 11 MB of fake data (exceeds the 10 MB limit)
    big_data = b"\xff\xd8" + b"\x00" * (11 * 1024 * 1024)
    r = client.post(
        f"/api/recipes/{rid}/image",
        files={"file": ("big.jpg", big_data, "image/jpeg")},
    )
    assert r.status_code == 422
    assert "too large" in r.json()["detail"].lower()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_recipes.py -k "upload_image" -v
```

Expected: FAILED — route doesn't exist yet.

- [ ] **Step 3: Add image upload route to `api/routes/recipes.py`**

Add imports at the top:

```python
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
```

Add these constants after the imports:

```python
_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_EXT_MAP = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
```

Also update the import from `recipe_extractor.database` to include `update_recipe`:

```python
from recipe_extractor.database import (
    list_recipes, search_recipes, get_recipe, save_recipe, delete_recipe, update_recipe
)
```

Add the route after `api_delete_recipe`:

```python
@router.post("/recipes/{recipe_id}/image")
async def api_upload_image(
    recipe_id: int,
    file: UploadFile = File(...),
    db: Path = Depends(get_db_path),
):
    if not get_recipe(recipe_id, db_path=db):
        raise HTTPException(status_code=404, detail="Recipe not found")
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="File too large (max 10 MB)")

    images_dir = db.parent / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    ext = _EXT_MAP[file.content_type]
    dest = images_dir / f"{recipe_id}{ext}"
    dest.write_bytes(contents)

    image_url = f"/images/{recipe_id}{ext}"
    update_recipe(recipe_id, {"image_url": image_url}, db_path=db)
    return {"image_url": image_url}
```

- [ ] **Step 4: Mount `/images/` in `api/main.py` before SPA catch-all**

Replace the production-serving block with:

```python
# Serve uploaded images (must be mounted before SPA catch-all)
_images_dir = Path(__file__).parent.parent / "data" / "images"
_images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=_images_dir), name="images")

# Serve built React app in production
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(_dist / "index.html")
```

- [ ] **Step 5: Add `/images` proxy to `frontend/vite.config.js`**

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/images': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 6: Run image upload tests**

```bash
python -m pytest tests/test_recipes.py -k "upload_image" -v
```

Expected: All 4 tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add api/routes/recipes.py api/main.py frontend/vite.config.js tests/test_recipes.py
git commit -m "feat: add image upload endpoint, mount /images static dir, proxy in vite"
```

---

## Task 3: PUT /api/recipes/{id} — Update Recipe Endpoint

**Files:**
- Modify: `api/routes/recipes.py`
- Test: `tests/test_recipes.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_recipes.py`:

```python
def _add_recipe(client, monkeypatch, url="https://example.com/recipe"):
    """Helper: monkeypatch scraper, post a recipe, return json."""
    import api.routes.recipes as recipes_mod
    fake = {
        "title": "Original Title", "source_url": url,
        "ingredients": ["flour"], "instructions": ["mix"],
        "cuisine": "Italian", "category": "Dinner",
        "servings": "4", "prep_time": 10, "cook_time": 20, "total_time": 30,
        "calories": 300.0, "protein_g": 10.0, "carbs_g": None,
        "fat_g": None, "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda u: {**fake, "source_url": u})
    r = client.post("/api/recipes", json={"url": url})
    return r.json()


def test_update_recipe_api_changes_title(client, monkeypatch):
    recipe = _add_recipe(client, monkeypatch)
    rid = recipe["id"]

    r = client.put(f"/api/recipes/{rid}", json={"title": "New Title"})
    assert r.status_code == 200
    assert r.json()["title"] == "New Title"
    # Other fields unchanged
    assert r.json()["cuisine"] == "Italian"


def test_update_recipe_api_updates_list_fields(client, monkeypatch):
    recipe = _add_recipe(client, monkeypatch)
    rid = recipe["id"]

    r = client.put(f"/api/recipes/{rid}", json={
        "ingredients": ["butter", "sugar"],
        "tags": ["sweet", "easy"],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["ingredients"] == ["butter", "sugar"]
    assert data["tags"] == ["sweet", "easy"]


def test_update_recipe_api_not_found(client):
    r = client.put("/api/recipes/9999", json={"title": "X"})
    assert r.status_code == 404


def test_update_recipe_api_empty_body(client, monkeypatch):
    recipe = _add_recipe(client, monkeypatch)
    rid = recipe["id"]
    r = client.put(f"/api/recipes/{rid}", json={})
    assert r.status_code == 422
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_recipes.py -k "update_recipe_api" -v
```

Expected: FAILED — route doesn't exist.

- [ ] **Step 3: Add Pydantic model and PUT route to `api/routes/recipes.py`**

Add Pydantic model after `AddRecipeRequest`:

```python
class UpdateRecipeRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    servings: Optional[str] = None
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    total_time: Optional[int] = None
    cuisine: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list] = None
    ingredients: Optional[list] = None
    instructions: Optional[list] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    image_url: Optional[str] = None
```

Add the route after `api_get_recipe` (before `api_delete_recipe`):

```python
@router.put("/recipes/{recipe_id}")
def api_update_recipe(
    recipe_id: int,
    body: UpdateRecipeRequest,
    db: Path = Depends(get_db_path),
):
    if not get_recipe(recipe_id, db_path=db):
        raise HTTPException(status_code=404, detail="Recipe not found")
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update")
    update_recipe(recipe_id, fields, db_path=db)
    return get_recipe(recipe_id, db_path=db)
```

- [ ] **Step 4: Run new tests**

```bash
python -m pytest tests/test_recipes.py -k "update_recipe_api" -v
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/routes/recipes.py tests/test_recipes.py
git commit -m "feat: add PUT /api/recipes/{id} update endpoint"
```

---

## Task 4: GET /api/recipes — Add Filter Query Params

**Files:**
- Modify: `api/routes/recipes.py`
- Test: `tests/test_recipes.py`

Context: The current route calls `search_recipes` or `list_recipes` based on `?q=`. Replace both with a single call to `filter_recipes` which handles all cases. Existing `?q=` behaviour is preserved.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_recipes.py`:

```python
def test_api_filter_by_cuisine(client, monkeypatch):
    import api.routes.recipes as recipes_mod
    for title, url, cuisine in [
        ("Italian dish", "https://example.com/i1", "Italian"),
        ("French dish", "https://example.com/f1", "French"),
    ]:
        fake = {
            "title": title, "source_url": url, "ingredients": [], "instructions": [],
            "cuisine": cuisine, "category": "Dinner", "servings": "", "prep_time": None,
            "cook_time": None, "total_time": None, "calories": None, "protein_g": None,
            "carbs_g": None, "fat_g": None, "fiber_g": None, "image_url": "",
            "description": "", "tags": [],
        }
        monkeypatch.setattr(recipes_mod, "extract_recipe", lambda u, f=fake: {**f, "source_url": u})
        client.post("/api/recipes", json={"url": url})

    r = client.get("/api/recipes?cuisine=Italian")
    assert r.status_code == 200
    results = r.json()
    assert len(results) == 1
    assert results[0]["cuisine"] == "Italian"


def test_api_filter_by_max_time(client, monkeypatch):
    import api.routes.recipes as recipes_mod
    for title, url, total_time in [
        ("Quick", "https://example.com/q1", 15),
        ("Slow", "https://example.com/s1", 90),
    ]:
        fake = {
            "title": title, "source_url": url, "ingredients": [], "instructions": [],
            "cuisine": "", "category": "", "servings": "", "prep_time": None,
            "cook_time": None, "total_time": total_time, "calories": None, "protein_g": None,
            "carbs_g": None, "fat_g": None, "fiber_g": None, "image_url": "",
            "description": "", "tags": [],
        }
        monkeypatch.setattr(recipes_mod, "extract_recipe", lambda u, f=fake: {**f, "source_url": u})
        client.post("/api/recipes", json={"url": url})

    r = client.get("/api/recipes?max_time=30")
    assert r.status_code == 200
    results = r.json()
    assert len(results) == 1
    assert results[0]["title"] == "Quick"


def test_api_list_includes_image_url(client, monkeypatch):
    import api.routes.recipes as recipes_mod
    fake = {
        "title": "With Photo", "source_url": "https://example.com/wp",
        "ingredients": [], "instructions": [], "cuisine": "", "category": "",
        "servings": "", "prep_time": None, "cook_time": None, "total_time": None,
        "calories": None, "protein_g": None, "carbs_g": None, "fat_g": None,
        "fiber_g": None, "image_url": "https://img.example.com/photo.jpg",
        "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda u: {**fake, "source_url": u})
    client.post("/api/recipes", json={"url": "https://example.com/wp"})

    r = client.get("/api/recipes")
    assert r.status_code == 200
    assert "image_url" in r.json()[0]
    assert r.json()[0]["image_url"] == "https://img.example.com/photo.jpg"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_recipes.py -k "api_filter or api_list_includes" -v
```

Expected: `test_api_filter_by_cuisine` and `test_api_filter_by_max_time` FAIL (params ignored). `test_api_list_includes_image_url` may pass or fail depending on column presence.

- [ ] **Step 3: Update the list route in `api/routes/recipes.py`**

Update the import from database:

```python
from recipe_extractor.database import (
    filter_recipes, get_recipe, save_recipe, delete_recipe, update_recipe
)
```

Replace `api_list_recipes`:

```python
@router.get("/recipes")
def api_list_recipes(
    q: Optional[str] = None,
    cuisine: Optional[str] = None,
    category: Optional[str] = None,
    max_time: Optional[int] = None,
    db: Path = Depends(get_db_path),
):
    return filter_recipes(
        query=q or "",
        cuisine=cuisine or "",
        category=category or "",
        max_time=max_time,
        db_path=db,
    )
```

- [ ] **Step 4: Run new tests**

```bash
python -m pytest tests/test_recipes.py -k "api_filter or api_list_includes" -v
```

Expected: All 3 PASS.

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/routes/recipes.py tests/test_recipes.py
git commit -m "feat: extend GET /api/recipes with cuisine, category, max_time filter params"
```

---

## Task 5: Frontend api.js — New Functions and Updated Signatures

**Files:**
- Modify: `frontend/src/lib/api.js`

Context: `listRecipes(q, signal)` needs to become `listRecipes(q, filters, signal)`. Add `updateRecipe` and `uploadImage`. `RecipeList.jsx` will be updated in Task 8 — for now the old 2-arg call will break, but `RecipeList` isn't tested in isolation.

- [ ] **Step 1: Replace `frontend/src/lib/api.js`**

```js
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
```

- [ ] **Step 2: Fix the `listRecipes` call in `RecipeList.jsx` to prevent a runtime crash**

The `listRecipes` signature changed from `(q, signal)` to `(q, filters, signal)`. Until Task 8 rewrites `RecipeList.jsx`, the old 2-arg call would pass the `AbortSignal` as `filters`, causing a JS error in `buildQuery`. Patch the call now:

In `frontend/src/pages/RecipeList.jsx`, find this line inside the `load` function:

```js
      const data = await api.listRecipes(q || '', signal)
```

Replace with:

```js
      const data = await api.listRecipes(q || '', {}, signal)
```

- [ ] **Step 3: Verify the app builds**

```bash
cd "H:/Other/Claude Projects/shiny-enigma/frontend"
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
git add frontend/src/lib/api.js frontend/src/pages/RecipeList.jsx
git commit -m "feat: add updateRecipe, uploadImage to api.js; update listRecipes signature"
```

---

## Task 6: EditRecipe Page + App.jsx Route

**Files:**
- Create: `frontend/src/pages/EditRecipe.jsx`
- Modify: `frontend/src/App.jsx`

Context: New route `/recipes/:id/edit` renders `EditRecipe`. The form fetches recipe data on mount, allows editing all fields, handles photo upload immediately on file selection, and calls `PUT /api/recipes/{id}` on save. Frontend-only (no new backend needed — all backend work is done in Tasks 2–4).

- [ ] **Step 1: Create `frontend/src/pages/EditRecipe.jsx`**

```jsx
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
        servings: r.servings || '',
        prep_time: r.prep_time ?? '',
        cook_time: r.cook_time ?? '',
        total_time: r.total_time ?? '',
        cuisine: r.cuisine || '',
        category: r.category || '',
        tags: (r.tags || []).join(', '),
        ingredients: (r.ingredients || []).join('\n'),
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
    <label style={{ display: 'block', color: '#888', fontSize: 13, marginBottom: 6 }}>
      {text}
    </label>
  )
  const field = { marginBottom: 16 }

  return (
    <div className="page">
      <button onClick={() => navigate(`/recipes/${id}`)} style={{
        background: 'none', border: 'none', color: '#888', cursor: 'pointer',
        marginBottom: 16, fontSize: 14,
      }}>← Cancel</button>

      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Edit Recipe</h1>

      {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

      <form onSubmit={handleSave}>
        {/* Basic info */}
        <div style={field}>{label('Title')}
          <input value={form.title} onChange={e => set('title', e.target.value)} required />
        </div>
        <div style={field}>{label('Description')}
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
        </div>
        <div style={field}>{label('Servings')}
          <input value={form.servings} onChange={e => set('servings', e.target.value)} />
        </div>

        {/* Timing */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[['prep_time', 'Prep (min)'], ['cook_time', 'Cook (min)'], ['total_time', 'Total (min)']].map(([k, lbl]) => (
            <div key={k} style={{ flex: 1 }}>
              {label(lbl)}
              <input type="number" min="0" value={form[k]} onChange={e => set(k, e.target.value)} />
            </div>
          ))}
        </div>

        {/* Classification */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>{label('Cuisine')}
            <input value={form.cuisine} onChange={e => set('cuisine', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>{label('Category')}
            <input value={form.category} onChange={e => set('category', e.target.value)} />
          </div>
        </div>
        <div style={field}>{label('Tags (comma-separated)')}
          <input value={form.tags} onChange={e => set('tags', e.target.value)} />
        </div>

        {/* Photo */}
        <div style={field}>{label('Photo')}
          {form.image_url && (
            <img src={form.image_url} alt="Recipe preview"
              style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8,
                       marginBottom: 8, display: 'block' }} />
          )}
          <input type="text" value={form.image_url} onChange={e => set('image_url', e.target.value)}
            placeholder="Image URL" style={{ marginBottom: 8 }} />
          <label style={{ color: '#7c6af7', fontSize: 14, cursor: 'pointer' }}>
            {uploading ? 'Uploading...' : '↑ Upload from device'}
            <input type="file" accept="image/*" onChange={handleImageUpload}
              style={{ display: 'none' }} disabled={uploading} />
          </label>
          {imageError && <p className="error" style={{ marginTop: 4, fontSize: 13 }}>{imageError}</p>}
        </div>

        {/* Ingredients */}
        <div style={field}>{label('Ingredients (one per line)')}
          <textarea value={form.ingredients} onChange={e => set('ingredients', e.target.value)} rows={8} />
        </div>

        {/* Instructions */}
        <div style={field}>{label('Instructions (one step per line)')}
          <textarea value={form.instructions} onChange={e => set('instructions', e.target.value)} rows={10} />
        </div>

        {/* Nutrition */}
        <div style={field}>{label('Nutrition')}
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

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => navigate(`/recipes/${id}`)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add the route to `frontend/src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import RecipeList from './pages/RecipeList'
import RecipeDetail from './pages/RecipeDetail'
import AddRecipe from './pages/AddRecipe'
import EditRecipe from './pages/EditRecipe'
import Stats from './pages/Stats'

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<RecipeList />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/recipes/:id/edit" element={<EditRecipe />} />
        <Route path="/add" element={<AddRecipe />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
    </>
  )
}
```

- [ ] **Step 3: Verify the app builds**

```bash
cd "H:/Other/Claude Projects/shiny-enigma/frontend"
npm run build
```

Expected: Build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
git add frontend/src/pages/EditRecipe.jsx frontend/src/App.jsx
git commit -m "feat: add EditRecipe page and /recipes/:id/edit route"
```

---

## Task 7: RecipeDetail — Photo Display + Edit Button

**Files:**
- Modify: `frontend/src/pages/RecipeDetail.jsx`

Context: Add a full-width photo below the title (if `image_url` exists) and an "Edit" button next to the title that navigates to `/recipes/:id/edit`.

- [ ] **Step 1: Update `frontend/src/pages/RecipeDetail.jsx`**

Replace the opening section (the `return` statement's first two children — the Back button and the `<h1>`) with this updated version. The key additions are: Edit button in a flex row with the title, and the photo block after the title row.

Replace the block from `return (` through the closing `</div>` of the page:

```jsx
  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{
        background: 'none', border: 'none', color: '#888', cursor: 'pointer',
        marginBottom: 16, fontSize: 14,
      }}>← Back</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{recipe.title}</h1>
        <button onClick={() => navigate(`/recipes/${id}/edit`)} style={{
          background: 'none', border: '1px solid #444', color: '#aaa', cursor: 'pointer',
          borderRadius: 6, padding: '6px 14px', fontSize: 13, marginLeft: 16, flexShrink: 0,
        }}>Edit</button>
      </div>

      {recipe.image_url && (
        <img
          src={recipe.image_url}
          alt={recipe.title}
          style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }}
        />
      )}

      <a href={recipe.source_url} target="_blank" rel="noreferrer"
         style={{ color: '#7c6af7', fontSize: 13, wordBreak: 'break-all' }}>
        {recipe.source_url}
      </a>

      {meta.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0', fontSize: 14, color: '#888' }}>
          {meta.map(m => <span key={m}>{m}</span>)}
        </div>
      )}

      {nutrition.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24, fontSize: 14, color: '#aaa' }}>
          {nutrition.map(n => <span key={n}>{n}</span>)}
        </div>
      )}

      {recipe.ingredients?.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Ingredients</h2>
          {recipe.ingredients.map((ing, i) => (
            <div key={i} onClick={() => toggleCheck(i)}
              role="checkbox" tabIndex={0} aria-checked={!!checked[i]}
              onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && toggleCheck(i)}
              style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '8px 0', borderBottom: '1px solid #1e1e1e', cursor: 'pointer',
              textDecoration: checked[i] ? 'line-through' : 'none',
              color: checked[i] ? '#555' : 'inherit',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 4, border: '2px solid',
                borderColor: checked[i] ? '#7c6af7' : '#444',
                background: checked[i] ? '#7c6af7' : 'transparent',
                flexShrink: 0, marginTop: 2,
              }} />
              {ing}
            </div>
          ))}
        </section>
      )}

      {recipe.instructions?.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Instructions</h2>
          {recipe.instructions.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
              <span style={{
                background: '#7c6af7', color: '#fff', borderRadius: '50%',
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</span>
              <p style={{ lineHeight: 1.6, paddingTop: 3 }}>{step}</p>
            </div>
          ))}
        </section>
      )}

      <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
        {deleting ? 'Deleting...' : 'Delete Recipe'}
      </button>
    </div>
  )
```

- [ ] **Step 2: Verify the app builds**

```bash
cd "H:/Other/Claude Projects/shiny-enigma/frontend"
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
git add frontend/src/pages/RecipeDetail.jsx
git commit -m "feat: add photo display and Edit button to RecipeDetail"
```

---

## Task 8: RecipeList — Filter Bar + Thumbnails

**Files:**
- Modify: `frontend/src/pages/RecipeList.jsx`

Context: Add three filter controls (cuisine dropdown, category dropdown, max cook time input) above the recipe grid. Derive dropdown options from the currently loaded recipe list. Filters combine with `?q=` and are passed as the `filters` object to `api.listRecipes`. Also update `RecipeCard` to show a thumbnail and fix the `listRecipes` call signature (now takes `(q, filters, signal)`).

- [ ] **Step 1: Replace `frontend/src/pages/RecipeList.jsx`**

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function RecipeCard({ recipe, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
      padding: 16, cursor: 'pointer', transition: 'border-color 0.15s',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = '#7c6af7'}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}
    >
      {recipe.image_url && (
        <img src={recipe.image_url} alt=""
          style={{ position: 'absolute', top: 12, right: 12, width: 56, height: 56,
                   objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
      )}
      <div style={{ fontWeight: 600, marginBottom: 6, paddingRight: recipe.image_url ? 72 : 0 }}>
        {recipe.title}
      </div>
      <div style={{ color: '#888', fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {recipe.cuisine && <span>{recipe.cuisine}</span>}
        {recipe.category && <span>{recipe.category}</span>}
        {recipe.total_time && <span>{recipe.total_time} min</span>}
        {recipe.calories && <span>{Math.round(recipe.calories)} cal</span>}
      </div>
    </div>
  )
}

export default function RecipeList() {
  const [recipes, setRecipes] = useState([])
  const [allRecipes, setAllRecipes] = useState([])   // unfiltered — for dropdown options
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ cuisine: '', category: '', max_time: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Fetch all recipes once to populate dropdown options — independent of active filters
  useEffect(() => {
    api.listRecipes('', {}).then(setAllRecipes).catch(() => {})
  }, [])

  const load = useCallback(async (q, f, signal) => {
    setLoading(true)
    try {
      const activeFilters = {
        ...(f.cuisine ? { cuisine: f.cuisine } : {}),
        ...(f.category ? { category: f.category } : {}),
        ...(f.max_time ? { max_time: Number(f.max_time) } : {}),
      }
      const data = await api.listRecipes(q || '', activeFilters, signal)
      setRecipes(data)
      setError('')
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => load(query, filters, controller.signal), query ? 300 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, filters, load])

  const setFilter = (k, v) => setFilters(prev => ({ ...prev, [k]: v }))
  const clearFilters = () => setFilters({ cuisine: '', category: '', max_time: '' })
  const hasFilters = filters.cuisine || filters.category || filters.max_time

  // Dropdown options always reflect the full collection, not the current filtered view
  const cuisines = useMemo(() => [...new Set(allRecipes.map(r => r.cuisine).filter(Boolean))].sort(), [allRecipes])
  const categories = useMemo(() => [...new Set(allRecipes.map(r => r.category).filter(Boolean))].sort(), [allRecipes])

  const selectStyle = {
    background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#ccc',
    borderRadius: 8, padding: '8px 12px', fontSize: 14, cursor: 'pointer',
  }

  return (
    <div className="page">
      <input
        type="text"
        placeholder="Search recipes..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        <select value={filters.cuisine} onChange={e => setFilter('cuisine', e.target.value)} style={selectStyle}>
          <option value="">All cuisines</option>
          {cuisines.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.category} onChange={e => setFilter('category', e.target.value)} style={selectStyle}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number" min="1" placeholder="Max time (min)"
          value={filters.max_time} onChange={e => setFilter('max_time', e.target.value)}
          style={{ ...selectStyle, width: 140 }}
        />
        {hasFilters && (
          <button onClick={clearFilters} style={{
            background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13,
          }}>Clear filters</button>
        )}
      </div>

      {loading && <p className="dim">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && recipes.length === 0 && (
        <p className="dim">{query || hasFilters ? 'No results.' : 'No recipes yet. Add one!'}</p>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {recipes.map(r => (
          <RecipeCard key={r.id} recipe={r} onClick={() => navigate(`/recipes/${r.id}`)} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app builds**

```bash
cd "H:/Other/Claude Projects/shiny-enigma/frontend"
npm run build
```

Expected: Build succeeds, no errors.

- [ ] **Step 3: Run full backend test suite one final time**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
cd "H:/Other/Claude Projects/shiny-enigma"
git add frontend/src/pages/RecipeList.jsx
git commit -m "feat: add filter bar and thumbnails to RecipeList"
```

---

## Done

All tasks complete. The app now has:
- Full recipe editing at `/recipes/:id/edit`
- Photo upload (file or URL) on the edit page and display on detail + list
- Filter bar on the recipe list (cuisine, category, max cook time)
- All 3 features wired through tested API endpoints backed by new DB functions

Next: use `superpowers:finishing-a-development-branch` to merge or create a PR.
