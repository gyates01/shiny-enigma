# Pantry Stock Levels & On-Hand Fix — shiny-enigma

**Date:** 2026-03-26
**Status:** Approved
**Builds on:** `2026-03-25-pantry-logger-design.md`

## Goal

Two changes to the pantry feature:

1. **Bug fix** — Ingredient on-hand matching produces false positives (e.g. `"egg"` marks `"eggplant"` as on hand). Fix with word-boundary matching.
2. **Stock levels** — Each pantry item tracks how much of it is on hand, shown inline on the pantry row as a muted secondary control.

## Bug Fix — On-Hand Matching

**File:** `api/utils/normalizer.py` — `is_on_hand()`

Change the substring check from a plain `in` test to a `re.search` with `\b` word boundaries:

```python
# Before
return any(item.lower() in norm for item in pantry_names)

# After
import re
return any(re.search(r'\b' + re.escape(item.lower()) + r'\b', norm) for item in pantry_names)
```

This prevents partial-word false positives: `"egg"` no longer matches `"eggplant"`, `"butter"` no longer matches `"butternut squash"`.

## Stock Levels — Data Model

Two new columns added to `pantry_items` via `ALTER TABLE` migration in `recipe_extractor/pantry.py`:

```sql
ALTER TABLE pantry_items ADD COLUMN stock_mode  TEXT DEFAULT 'level';
ALTER TABLE pantry_items ADD COLUMN stock_value TEXT;
```

- **`stock_mode`** — `'level'` or `'qty'`. Auto-set on `add_item()` based on category.
- **`stock_value`** — For level mode: `'full'`, `'med'`, `'low'`, or `NULL` (unset). For qty mode: a number string (e.g. `'2.5'`), or `NULL`.

### Mode Detection by Category

| Mode | Categories | Unit |
|------|-----------|------|
| `qty` | Produce, Meat | Produce → `ea` · Meat → `lbs` |
| `level` | Pantry, Spices, Dairy, Other | — |
| Exception | `egg` (Dairy) | always `qty` · unit `ea` |

## Stock Levels — Backend

### `recipe_extractor/pantry.py`

- `init_pantry_table()` — run `ALTER TABLE ... ADD COLUMN` with `IF NOT EXISTS` guard (SQLite doesn't support this natively; use `PRAGMA table_info` check instead).
- `add_item()` — accepts `stock_mode` param, sets it based on category before insert.
- `update_item()` — replaces `update_note()`. Accepts `note`, `stock_mode`, `stock_value` as optional fields; updates only those provided.

### `api/routes/pantry.py`

- `PatchNoteRequest` → `PatchItemRequest` — adds optional `stock_mode` and `stock_value` fields.
- `PATCH /api/pantry/{id}` — calls `update_item()` instead of `update_note()`.
- `GET /api/pantry` and `POST /api/pantry` responses now include `stock_mode` and `stock_value`.

### `frontend/src/lib/api.js`

- `patchPantryNote(id, note)` → `patchPantryItem(id, fields)` where `fields` is `{ note?, stock_mode?, stock_value? }`.

## Stock Levels — Frontend (Pantry.jsx)

### Row layout

```
 [name]   [note pill?]   [stock control ↻]   [×]
```

Stock control is right-aligned, muted, smaller than item name. Always visible.

### Level mode control

A cycling pill. Clicking steps: `Full → Med → Low → unset → Full`.

| Value | Label | Style |
|-------|-------|-------|
| `'full'` | Full | Muted green bg + text |
| `'med'` | Med | Muted amber bg + text |
| `'low'` | Low | Muted red bg + text |
| `null` | `——` | Gray outline, no fill |

### Qty mode control

Small inline `<input type="number">` (~56px wide) + unit label (`ea` or `lbs`). Saves on blur or Enter.

### Mode override toggle

A small `↻` icon button after the control. Always visible but very muted (`#4b5563`). Clicking switches `stock_mode` (level ↔ qty) and clears `stock_value` to `null`. Calls `patchPantryItem`.

### State management

Optimistic update: update local state immediately, then PATCH in background. On error, revert.

## Files Changed

| File | Change |
|------|--------|
| `api/utils/normalizer.py` | Word-boundary fix in `is_on_hand` |
| `recipe_extractor/pantry.py` | Migration, `add_item` stock_mode, `update_item` replaces `update_note` |
| `api/routes/pantry.py` | `PatchItemRequest`, wire `update_item` |
| `frontend/src/lib/api.js` | `patchPantryItem` replaces `patchPantryNote` |
| `frontend/src/pages/Pantry.jsx` | Stock control on each row |

## Out of Scope

- Showing stock level on the RecipeDetail ingredient list
- Stock-aware "makeable" logic (e.g. "do I have enough flour?")
- Shopping list generation from low/missing items
