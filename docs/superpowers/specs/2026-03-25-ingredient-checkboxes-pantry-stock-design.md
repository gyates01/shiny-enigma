# Ingredient Checkboxes + Pantry Stock Levels — Design

**Date:** 2026-03-25
**Status:** Approved

---

## Goal

Two improvements to the pantry/recipe flow:

1. **RecipeDetail ingredient rows** — compact layout with a cook-along checkbox instead of full-width coloured bars.
2. **Pantry stock tracking** — each item shows how much is left via a smart Level (Full/Med/Low) or Quantity mode, auto-selected by category with an override toggle.

---

## Feature 1: Ingredient Row Redesign (RecipeDetail)

### Layout

Replace the full-width coloured bar with a compact row:

```
[✓] ingredient text
```

- Thin left border accent (3 px) carries the colour: green (`#22c55e`) for On hand, red (`#ef4444`) for Still need, neutral (`#374151`) when pantry is empty.
- Checkbox is a manual cook-along toggle — **not persisted**, lives in `useState`. Independent of `on_hand`.
- Checking an ingredient does not change its `on_hand` status.
- Section labels ("On hand" / "Still need"), the pantry prompt, and the "Add missing to pantry" button are unchanged.

### Checkbox style

```
width: 18px, height: 18px, border-radius: 4px
unchecked: border 2px solid #4b5563, background transparent
checked:   border + background #7c6af7 (accent purple), checkmark ✓ white
```

Tapping anywhere on the row toggles the checkbox (role="checkbox", keyboard accessible).

---

## Feature 2: Pantry Stock Tracking

### Modes

Each pantry item has one of two stock modes:

| Mode | Display | Use case |
|------|---------|----------|
| `level` | Cycling pill: Full → Med → Low | Staples with no natural count |
| `qty` | Inline editable number + computed label | Countable/weighable items |

### Auto-detection by category

| Category | Default mode | Qty format |
|----------|-------------|------------|
| Spices | `level` | — |
| Pantry | `level` | — |
| Dairy | `level` | — |
| Other | `level` | — |
| Produce | `qty` | count — `"2 limes"` |
| Meat | `qty` | weight — `"1.5 lbs chicken"` |

**Exception:** items whose normalised name is `"egg"` or `"eggs"` default to `qty` (count), regardless of Dairy category.

### Level pill (level mode)

Tapping cycles: `null` (unset) → `"full"` → `"med"` → `"low"` → `null`.

| Value | Colour |
|-------|--------|
| `null` / unset | Subtle gray `#374151`, text `#6b7280` — "Set level" |
| `"full"` | `#1f2937` bg, `#6b7280` text |
| `"med"` | `#451a03` bg, `#fbbf24` text (amber) |
| `"low"` | `#7f1d1d` bg, `#f87171` text (red) |

### Quantity input (qty mode)

- A small number input (or text for Produce freeform) showing the current value.
- **Display format:**
  - Produce: `"{n} {name}"` — pluralises by appending `"s"` if `n != 1` and name doesn't already end in `"s"`. E.g. `"2 limes"`, `"1 lime"`, `"3 tomatoes"` (already ends in s → no double-s).
  - Meat: `"{n} lbs {name}"` — `n` is a decimal, e.g. `"1.5 lbs chicken"`.
- Editing: tap the number to open an `<input type="number">` inline; blur or Enter saves.
- `null` value shows placeholder `"Add amount"`.

### Override toggle

Each item row has a small swap icon button (`⇄`) that switches between `level` and `qty` mode. Switching clears the current `stock_value` (sets to `null`).

---

## Data Model

Two new columns added to `pantry_items` via a migration in `init_pantry_table`:

```sql
ALTER TABLE pantry_items ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'level';
ALTER TABLE pantry_items ADD COLUMN stock_value TEXT;
```

`stock_value` stores:
- Level mode: `"full"`, `"med"`, `"low"`, or `null`
- Qty mode: numeric string `"2"`, `"1.5"`, or `null`

The existing `note` column is untouched — users can still add freeform notes alongside stock info.

`init_pantry_table` uses `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (SQLite supports `ADD COLUMN` but not `IF NOT EXISTS` — use a `try/except OperationalError` to handle existing columns).

---

## API Changes

### `POST /api/pantry`

`add_item` auto-detects `stock_mode` from category (and name for the egg exception). `stock_value` defaults to `null`.

Response gains `stock_mode` and `stock_value` fields.

### `GET /api/pantry`

Items include `stock_mode` and `stock_value`.

### `PATCH /api/pantry/{id}`

Request body expands to accept any combination of:

```json
{ "note": "string", "stock_mode": "level|qty", "stock_value": "string|null" }
```

All fields optional. Existing `update_note` function replaced by a general `update_item` function.

---

## Files Changed

**Modify:**
- `recipe_extractor/pantry.py` — add columns in `init_pantry_table`, update `add_item` to set `stock_mode`, replace `update_note` with `update_item`
- `api/routes/pantry.py` — update `PatchNoteRequest` → `PatchItemRequest`, pass stock fields through
- `frontend/src/pages/Pantry.jsx` — stock display (pill or qty input) + override toggle on each row
- `frontend/src/pages/RecipeDetail.jsx` — checkbox + thin border layout for ingredient rows
- `frontend/src/lib/api.js` — update `patchPantryNote` → `patchPantryItem` with full patch body

**No new files required.**

---

## Out of Scope

- Persisting cook-along checkbox state across page reloads
- Expiry tracking
- Shopping list generation from Low/Out items
- Quantity math ("do I have enough flour for this recipe?")
