# Pantry Backup Tracking Design

**Date:** 2026-03-27

## Goal

Let users record backup stock alongside current stock for pantry items, and surface that info on recipe ingredient lists.

## Two backup scenarios

**Level-mode items (bottles, seasonings, canned goods):**
A backup is a sealed, full unit in reserve. Tracked as an integer count (0–N).
- Example: soy sauce is Low, but there's 1 full backup bottle in the cupboard.

**Qty-mode items (meat):**
Backup is additional weight frozen. The current `stock_value` = defrosted/ready lbs; backup = frozen lbs still in the freezer.
- Example: 1.5 lbs chicken defrosted and ready, 4.0 lbs still frozen.

## Data model

Add one column to `pantry_items`:

```sql
backup_value TEXT  -- NULL = no backup tracked
```

Semantics by mode:
- `stock_mode = 'level'`: integer string, e.g. `"2"` (count of full backup units). `"0"` or NULL = no backup.
- `stock_mode = 'qty'`: decimal string, e.g. `"4.0"` (lbs frozen). NULL = no frozen reserve.

No new columns beyond `backup_value`. The existing `stock_mode` column governs interpretation.

## Backend changes

### `recipe_extractor/pantry.py`

- `init_pantry_table`: add `backup_value TEXT` to CREATE TABLE; add ALTER TABLE migration guard (same pattern as `stock_mode`/`stock_value`).
- `add_item`: include `backup_value=None` param; insert and return it.
- `list_items`: add `backup_value` to SELECT.
- `update_item`: add `'backup_value'` to the `allowed` set.

### `api/utils/normalizer.py`

Add a helper alongside `is_on_hand`:

```python
def find_pantry_match(ing_text: str, pantry_items: list[dict]) -> dict | None:
    """Return the first pantry item whose name matches ing_text (word-boundary),
    or None. Uses the same matching logic as is_on_hand."""
```

This lets callers get the full pantry item dict (including `stock_mode`, `stock_value`, `backup_value`) rather than just a boolean.

`is_on_hand` can then delegate to `find_pantry_match` to avoid duplicating logic:

```python
def is_on_hand(ing_text: str, pantry_names: list[str]) -> bool:
    # keep existing signature for backwards compat — used in makeable check
    norm = _normalize(ing_text)
    return any(re.search(r'\b' + re.escape(item.lower()) + r'\b', norm) for item in pantry_names)
```

### `api/routes/recipes.py`

Wherever ingredients are annotated with `on_hand`, enrich the response:

**Before:**
```python
{"text": ing, "on_hand": is_on_hand(ing, pantry_names)}
```

**After:**
```python
pantry_items = list_items(db_path=db)
pantry_names = [item["name"] for item in pantry_items]

# per ingredient:
match = find_pantry_match(ing, pantry_items)
{
    "text": ing,
    "on_hand": match is not None,
    "stock_mode": match["stock_mode"] if match else None,
    "stock_value": match["stock_value"] if match else None,
    "backup_value": match["backup_value"] if match else None,
}
```

This change applies to all three places in `recipes.py` that annotate ingredients.

### `api/routes/pantry.py`

`PatchItemRequest`: add `backup_value: Optional[str] = None`.

## Frontend changes

### `frontend/src/lib/api.js`

`patchPantryItem(id, fields)` already accepts any fields dict — no change needed.

### `frontend/src/pages/Pantry.jsx` — `StockControl` component

**Level mode — backup count:**
- When `backup_value` is null/0: show a dim `⊕` icon at the end of the row; clicking sets backup to 1.
- When `backup_value` > 0: show a filled badge `+N backup` (e.g. `+1 backup`); clicking cycles N up; long-press or right-click cycles back down (or just: each click increments, clicking the badge when it shows the max wraps to 0).
- Keep it simple: click the badge to increment by 1; at 3 it wraps back to 0.
- On change, call `onUpdate(item.id, { backup_value: String(newCount) })`.

**Qty mode — frozen reserve:**
Row layout:
```
ready: [1.5] lbs  |  frozen: [4.0] lbs
```
- Second input for `backup_value`, blur-to-save (same pattern as `stock_value` input).
- Empty/null = no frozen stock shown (input shows placeholder "0").

### `frontend/src/pages/RecipeDetail.jsx`

In the on-hand ingredient section, add a secondary grey badge when `backup_value` is set and non-zero:

**Level mode:**
```
[Low]  [+1 backup]
```

**Qty mode:**
```
[1.5 lbs]  [4 lbs frozen]
```

Badge is display-only on the recipe page (no editing here).

The ingredient objects now carry `stock_mode`, `stock_value`, and `backup_value` from the API — use those directly.

## Files to change

| File | Change |
|---|---|
| `recipe_extractor/pantry.py` | Add `backup_value` column, migration guard, update all CRUD |
| `api/utils/normalizer.py` | Add `find_pantry_match()`, refactor `is_on_hand` to use it |
| `api/routes/recipes.py` | Enrich ingredient `on_hand` objects with stock + backup fields |
| `api/routes/pantry.py` | Add `backup_value` to `PatchItemRequest` |
| `frontend/src/pages/Pantry.jsx` | Backup count cycling (level) + frozen input (qty) in `StockControl` |
| `frontend/src/pages/RecipeDetail.jsx` | Show backup badge on on-hand ingredients |

`frontend/src/lib/api.js` — no change needed.

## Out of scope

- Shopping list integration (backup reducing the urgency to buy)
- Backup having its own stock level (always assumed full for bottles)
- Notifications when backup is consumed (backup_value goes to 0)
