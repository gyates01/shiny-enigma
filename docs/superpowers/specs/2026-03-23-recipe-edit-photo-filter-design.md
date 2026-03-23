# Recipe Edit, Photo, and Filter — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Goal

Add three features to the existing recipe web UI: full recipe editing, photo attachment (upload or URL), and structured filtering on the recipe list.

## Constraints

- Local network only — no cloud storage, no auth
- `recipe_extractor/` Python modules must not be modified
- Existing patterns (FastAPI + React + Vite, single-port production) must be followed
- Images stored on local disk alongside the SQLite DB

---

## Architecture

### New Files

```
api/routes/recipes.py       ← extend with PUT /{id} and POST /{id}/image
recipe_extractor/database.py ← add update_recipe()
frontend/src/pages/EditRecipe.jsx   ← new edit page
frontend/src/lib/api.js     ← add updateRecipe(), uploadImage() calls
data/images/                ← uploaded image files (created at runtime)
```

### Modified Files

```
api/main.py                 ← mount /images/ static dir
frontend/src/pages/RecipeList.jsx   ← add filter bar, thumbnails
frontend/src/pages/RecipeDetail.jsx ← add photo display, Edit button
frontend/src/components/Nav.jsx     ← no change needed
```

---

## Backend

### Image Storage

Uploaded images are saved to `data/images/` (sibling of `data/recipes.db`). FastAPI mounts this directory as static files at `/images/`. The `image_url` column in the DB stores either:
- The original scraped URL (e.g. `https://example.com/photo.jpg`), or
- A local path (e.g. `/images/42.jpg`) for uploaded files

File naming: `{recipe_id}{ext}` where ext is derived from the uploaded file's content type (`.jpg`, `.png`, `.webp`). Existing file is overwritten on re-upload.

### New `database.py` Function

```python
def update_recipe(recipe_id: int, fields: dict, db_path: Path = DB_PATH) -> bool:
    """Update editable fields of a recipe. Returns True if a row was updated."""
```

Accepts a dict of only the fields to update. Uses a dynamic `SET` clause. Does not update `source_url` or `date_added`.

### API Endpoints

#### `PUT /api/recipes/{id}`

- Body: JSON with any subset of editable fields
- Editable fields: `title`, `description`, `servings`, `prep_time`, `cook_time`, `total_time`, `cuisine`, `category`, `tags` (list), `ingredients` (list), `instructions` (list), `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `image_url`
- Returns: updated full recipe (200) or 404
- Validation: at least one field must be present

#### `POST /api/recipes/{id}/image`

- Body: `multipart/form-data` with field `file` (image file)
- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Max size: 10 MB (enforced in the route)
- Saves file to `data/images/{id}{ext}`
- Updates `image_url` in DB to `/images/{id}{ext}`
- Returns: `{ "image_url": "/images/42.jpg" }` (200) or 404 / 422

#### `GET /api/recipes` — Extended

New optional query params (combine with existing `?q=`):

| Param | Type | Behaviour |
|-------|------|-----------|
| `cuisine` | string | exact match (case-insensitive) |
| `category` | string | exact match (case-insensitive) |
| `max_time` | integer | `total_time <= max_time` (NULL rows excluded) |

All params are AND-combined. Empty string params are ignored.

---

## Frontend

### RecipeList page

**Filter bar** sits between the search input and the recipe grid. Three controls:

1. **Cuisine** — `<select>` populated from unique non-empty cuisine values in the current recipe list
2. **Category** — `<select>` populated from unique non-empty category values
3. **Max cook time** — number input (minutes), placeholder "Any time"

A "Clear filters" text button resets all three to empty. Active filters are passed as additional query params to `GET /api/recipes`. The filter bar refetches on change (no debounce needed — server round-trip is fast for a local app).

**Thumbnails** — recipe cards show a small image (64×64 px, `object-fit: cover`) in the top-right corner if `image_url` is set.

### RecipeDetail page

- **Photo** — full-width image below the title if `image_url` is set. For external URLs, shown as-is. For `/images/...` paths, the `src` is relative to the API base URL.
- **Edit button** — top-right of the page header, navigates to `/recipes/:id/edit`

### EditRecipe page (`/recipes/:id/edit`)

Fetches the recipe on mount. Form sections:

1. **Basic info:** title, description, servings
2. **Timing:** prep time, cook time, total time (minutes, number inputs)
3. **Classification:** cuisine, category, tags (comma-separated text input, split on save)
4. **Photo:** shows current image (thumbnail); file input labeled "Upload new photo" (`accept="image/*"`) — on mobile this triggers the camera or gallery. Separate from main save — clicking "Upload" calls `POST /api/recipes/{id}/image` immediately and updates the preview.
5. **Ingredients:** `<textarea>` one ingredient per line
6. **Instructions:** `<textarea>` one step per line
7. **Nutrition:** calories, protein, carbs, fat, fiber (number inputs, optional)

**Save** calls `PUT /api/recipes/{id}` with all fields, then navigates back to `/recipes/:id`.
**Cancel** navigates back without saving.

### `api.js` additions

```js
updateRecipe: (id, data) => request(`/recipes/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }),
uploadImage:  (id, file) => { const fd = new FormData(); fd.append('file', file); return request(`/recipes/${id}/image`, { method: 'POST', body: fd }); },
listRecipes:  (q, filters, signal) => request(`/recipes${buildQuery(q, filters)}`, signal ? { signal } : {}),
```

Where `buildQuery` builds the query string from `q`, `cuisine`, `category`, `max_time`.

---

## Error Handling

- File too large (>10 MB) → 422 with message; frontend shows inline error on the photo section
- Unsupported file type → 422
- Recipe not found → 404; frontend redirects to `/`
- Save fails → inline error message on the edit form, form stays open

---

## Out of Scope

- Image cropping or resizing
- Multiple photos per recipe
- Undo / revision history
- Bulk editing
