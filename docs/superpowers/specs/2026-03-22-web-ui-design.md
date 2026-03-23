# Web UI Design — shiny-enigma Recipe Extractor

**Date:** 2026-03-22
**Status:** Approved

## Goal

Add a local-network web interface to the existing CLI recipe extractor so the app is fully usable from both desktop and mobile (e.g. checking ingredients at the grocery store).

## Constraints

- Local network only (home Wi-Fi) — no public internet access required
- Existing `recipe_extractor/` Python modules must not be modified
- Single port in production — FastAPI serves the built React frontend statically

## Architecture

```
shiny-enigma/
├── recipe_extractor/       ← untouched existing modules
│   ├── scraper.py
│   ├── database.py
│   ├── exporter.py
│   └── cli.py
├── api/
│   ├── main.py             ← FastAPI app, CORS, static file serving
│   └── routes/
│       ├── recipes.py      ← CRUD + search
│       └── export.py       ← Excel export trigger
├── frontend/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/
│       │   ├── RecipeList.jsx
│       │   ├── RecipeDetail.jsx
│       │   ├── AddRecipe.jsx
│       │   └── Stats.jsx
│       └── lib/
│           └── api.js
├── requirements.txt        ← add fastapi, uvicorn
└── data/recipes.db         ← shared with CLI
```

The FastAPI backend imports `recipe_extractor` modules directly. In production, `api/main.py` mounts the Vite build output (`frontend/dist/`) as static files. During development, Vite dev server proxies `/api` to FastAPI (same pattern as Finance Tracker).

## Navigation

**Adaptive nav:** bottom tab bar on mobile, top nav bar on desktop.

- Implemented via CSS media query — `@media (max-width: 768px)` switches nav from top to fixed bottom
- Four nav items: **Recipes**, **Search**, **Add**, **Stats**

## Pages

### Recipes (home)
- Card grid of saved recipes
- Each card shows: title, cuisine, category, total time, calories
- Inline search bar at top filters by title/cuisine/category as you type
- Tap a card → Recipe Detail

### Recipe Detail
- Full recipe: title, source URL, meta (servings, time, cuisine, category, nutrition)
- Ingredients as a checklist (tap to cross off — local state only, not persisted)
- Step-by-step numbered instructions
- Delete button (with confirmation)

### Add Recipe
- Single URL text input + Add button
- Loading spinner while scraper runs (can take 3–10 seconds)
- On success: show saved recipe title, offer to view it or add another
- On error: show message, keep URL in input for retry

### Stats
- Total recipe count, avg calories, avg total time
- Breakdown tables by cuisine and category (mirrors CLI `stats` command)

## API Endpoints

```
GET    /api/recipes              list all (id, title, cuisine, category, total_time, calories, servings, date_added)
                                 optional ?q= param searches across title, cuisine, category, tags, ingredients
POST   /api/recipes              body: { url: string } → scrape and save; returns saved recipe
GET    /api/recipes/{id}         full recipe with ingredients and instructions
DELETE /api/recipes/{id}         delete; returns 204
GET    /api/stats                aggregate stats
GET    /api/export               triggers Excel export, returns file as attachment
                                 (Content-Disposition: attachment; filename="recipes_<timestamp>.xlsx")
```

Note: search is a query param on `GET /api/recipes` (not a separate `/search` sub-route) to avoid a FastAPI route conflict between `/recipes/search` and `/recipes/{id}`.

## Error Handling

- Scraper errors (unsupported site, network timeout) → 422 with user-readable message; frontend shows inline error on Add page
- Recipe not found → 404
- Duplicate URL → upsert (existing behavior from `save_recipe`)
- API unreachable from frontend → generic "Could not connect" banner

## Running (Development)

```bash
# Terminal 1 — API
cd api && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd frontend && npm run dev -- --host
```

Open http://localhost:5173 on desktop, http://[local-ip]:5173 on mobile.
The `--host` flag is required for Vite to bind to the network interface so mobile devices can reach the dev server.

## Running (Production / Local Network)

```bash
cd frontend && npm run build
cd api && uvicorn main:app --host 0.0.0.0 --port 8000
```

Open http://[local-ip]:8000 on any device on the network.

## Out of Scope

- Authentication
- Public internet access
- Pantry/inventory tracking (separate future project)
- Persisting ingredient checklist state
