# Pantry Logger Design — shiny-enigma Recipe Extractor

**Date:** 2026-03-25
**Status:** Approved

## Goal

Add a pantry inventory feature to the recipe extractor web app so users can track which ingredients they have on hand. When viewing a recipe, the ingredient list shows which items are already stocked and which still need to be bought.

## Constraints

- Extends the existing FastAPI + React web UI (defined in `2026-03-22-web-ui-design.md`)
- No new database files — pantry data lives in the existing `recipes.db`
- No external NLP dependencies — normalization uses regex only
- Works on mobile (local network) — same constraint as base web UI

## Architecture

```
shiny-enigma/
├── recipe_extractor/
│   ├── pantry.py               ← NEW: DB functions for pantry_items table
│   └── database.py             ← untouched
├── api/
│   ├── utils/
│   │   └── normalizer.py       ← NEW: ingredient normalization + matching + category detection
│   └── routes/
│       ├── pantry.py           ← NEW: REST endpoints for pantry
│       └── recipes.py          ← MODIFY: add on_hand per ingredient in GET /api/recipes/{id}
├── frontend/src/
│   ├── pages/
│   │   ├── Pantry.jsx          ← NEW: pantry management page
│   │   └── RecipeDetail.jsx    ← MODIFY: grouped ingredient sections
│   ├── App.jsx                 ← MODIFY: add /pantry route
│   └── components/Nav.jsx      ← MODIFY: add Pantry tab (5th item)
└── data/recipes.db             ← shared, gains pantry_items table
```

## Data Model

New table added to `recipes.db` via `recipe_extractor/pantry.py`:

```sql
CREATE TABLE IF NOT EXISTS pantry_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL UNIQUE,
    note      TEXT,
    category  TEXT    NOT NULL DEFAULT 'Other',
    added_at  TEXT    NOT NULL
)
```

- **name** — normalized base ingredient name, e.g. `"flour"`, `"garlic"`, `"olive oil"`
- **note** — optional freeform string shown as a pill tag, e.g. `"1 bag"`, `"running low"`
- **category** — auto-detected on save from a built-in lookup map; one of: `Produce`, `Dairy`, `Meat`, `Pantry`, `Spices`, `Other`

## Normalization & Matching (`api/utils/normalizer.py`)

Applied to recipe ingredient strings before pantry comparison:

1. Lowercase the full string
2. Strip leading quantity + unit: `"2 cups"`, `"1/2 tsp"`, `"3 lbs"`, `"a pinch of"` → removed
3. Strip trailing prep notes: `", minced"`, `"(optional)"`, `", roughly chopped"`, `", to taste"` → removed
4. Strip filler adjectives: `"fresh"`, `"large"`, `"small"`, `"divided"`, `"dried"` → removed
5. Strip punctuation and collapse whitespace

**Match rule:** A recipe ingredient is "on hand" if any pantry item `name` is a substring of the normalized ingredient string, or the normalized ingredient string is a substring of the pantry item `name`.

Examples:
- Pantry: `"garlic"` → matches `"2 cloves garlic, minced"` ✓
- Pantry: `"olive oil"` → matches `"3 tbsp extra-virgin olive oil"` ✓
- Pantry: `"flour"` → matches `"2 cups all-purpose flour, sifted"` ✓
- Pantry: `"rice flour"` → does NOT match `"rice"` (substring direction check)

**Category detection:** A lookup dict maps ~200 common ingredient names to categories. Checked at save time by finding the first key that is a substring of the new item name (or vice versa). Falls back to `"Other"`.

## API Endpoints

### New: Pantry routes (`/api/pantry`)

```
GET    /api/pantry              → list all items sorted by category then name
                                  returns: [{ id, name, note, category, added_at }]

POST   /api/pantry              body: { name: string, note?: string }
                                  normalizes name, auto-detects category, saves
                                  returns: { id, name, note, category, added_at }
                                  409 if name already exists

DELETE /api/pantry/{id}         → 204 on success, 404 if not found

PATCH  /api/pantry/{id}         body: { note: string }
                                  → updates note only; returns updated item
```

### Modified: Recipes routes

`GET /api/recipes/{id}` — each ingredient object gains `on_hand: bool`:
```json
{
  "ingredients": [
    { "text": "2 cloves garlic, minced", "on_hand": true },
    { "text": "150g pancetta", "on_hand": false }
  ]
}
```

`GET /api/recipes` (list) — each recipe gains `makeable: bool`:
- `true` if every ingredient has `on_hand: true`
- Used for the "N recipes makeable" count on the Pantry page

## Pages

### Pantry Page (`/pantry`)

**Visual style:** Airy dark (navy `#111827` background, `#1f2937` item rows, rounded).

**Layout (top to bottom):**
1. Page header: "Pantry" + item count
2. Quick-add bar: text input + Add button
3. Makeable banner: `"You can make N recipes with what you have · See all →"` (green, links to `/recipes?makeable=true`)
4. Search bar (filters items client-side)
5. Items grouped by category (Produce, Dairy, Meat, Pantry, Spices, Other)
   - Category label (uppercase, muted)
   - Item rows: **name** + optional note as pill tag + × delete button

**Item row detail:**
- Name: white, font-weight 500
- Note pill: `background #374151`, muted gray text; amber tint if note contains "low" or "out"
- Delete (×): far right, muted — tap to remove with no confirmation (easy to re-add)

**Add flow:** typing in the quick-add input and pressing Enter or the Add button posts to `POST /api/pantry`. On 409 (duplicate), shows inline "already in pantry" message. On success, item appears in the correct category group without page reload.

### Recipe Detail Enhancement

Ingredient list is split into two labeled sections:

- **On hand** — items where `on_hand: true`, green left border (`border-left: 3px solid #22c55e`)
- **Still need** — items where `on_hand: false`, red left border (`border-left: 3px solid #ef4444`)

Below the sections: **"Add missing to pantry"** button — bulk-posts all "still need" ingredient base names to `POST /api/pantry` (strips quantities/prep via the same normalization the backend uses, client-side preview before posting).

If pantry is empty (no items), ingredient list renders as normal (no sections, no borders) with a subtle prompt: `"Add items to your pantry to see what you have on hand."`

## Navigation

Nav gains a fifth item: **Pantry** (between Add and Stats).

- Desktop top nav: `Recipes | Search | Add | Pantry | Stats`
- Mobile bottom tab bar: same five items, icon + label

## Error Handling

- Duplicate pantry item → 409; frontend shows inline `"already in pantry"` (no toast)
- Pantry item not found → 404
- Normalization producing an empty string (e.g. user typed only a number) → 422 with message `"Please enter an ingredient name"`
- If pantry table doesn't exist yet (first run) → `init_pantry_table()` is called in the pantry route dependency, same pattern as `init_db()` in recipes

## Running

No changes to the run commands. The pantry table is created automatically on first request to any `/api/pantry` endpoint.

## Out of Scope

- Shopping list export
- Barcode / photo scanning
- Quantity math (e.g. "do I have enough flour for this recipe?")
- Sharing pantry across multiple users
- Expiry date tracking
